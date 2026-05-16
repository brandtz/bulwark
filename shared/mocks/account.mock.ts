/**
 * shared/mocks/account.mock.ts — MockAccountService
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - In-memory implementation of `IAccountService` so unit tests +
 *     mock-mode UX work without a DB.
 *   - Exports `__resetMockAccountForTests()` so unit tests can wipe
 *     soft-delete state between cases.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **Source data is the fixture roster.** The mock derives the
 *     export payload from `FIXTURE_USER_*` + a small synthetic activity
 *     list seeded per user. We avoid wiring this to the other mock
 *     stores (notifications, audit) so the test surface stays tight
 *     and deterministic.
 *   - **Sole-admin detection from fixture memberships.** An "admin" in
 *     a given org means a fixture user has role `org_admin` for that
 *     org. If exactly one fixture user qualifies, that user is the
 *     sole admin. This matches the real-service rule for the typical
 *     case but is intentionally simpler — the real service queries
 *     `memberships` directly.
 *   - **Soft-delete + purge state lives in this module.** No back
 *     channel into `MockAuthService`; a deleted user simply gets a
 *     non-null `deletedAt` in the export and the purge job removes it
 *     from the local store.
 *
 * # Decisions NOT taken
 *   - Mocking the cross-other-user redaction. The export payload's
 *     `auditEvents` come from a synthetic list keyed to the requesting
 *     user, so the other-actor redaction rule is exercised in the
 *     real-service tests, not the mock. The mock's responsibility is
 *     shape + the "excludes others' data" assertion.
 */
import type {
  AccountDeletionRequest,
  AccountDeletionResult,
  AccountExport,
  AccountExportAuditEvent,
  AccountExportMembership,
  AccountExportNotification,
  AccountExportSubscription,
  AccountExportSubLink,
  AccountExportHomeownerLink,
  AccountPurgeResult,
  IAccountService,
} from '../contracts/account'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_EXPORT_AUDIT_CAP,
  SoleAdminError,
  REDACTED_ACTOR,
} from '../contracts/account'
import {
  FIXTURE_ORG_ID,
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUB,
  FIXTURE_USER_SUPER,
} from './fixtures'

interface SoftDeletedRow {
  userId: string
  deletedAt: string
  /** Original PII captured before nulling, so the unit test can assert null-out. */
  scrubbed: { fullName: string | null; avatarUrl: string | null }
}

interface SyntheticActivity {
  userId: string
  notifications: AccountExportNotification[]
  subscriptions: AccountExportSubscription[]
  auditEvents: AccountExportAuditEvent[]
  /** Audit events authored by OTHER users that mention this user — must be excluded. */
  foreignAuditEvents: AccountExportAuditEvent[]
}

const NOW_FIXED = '2026-05-16T00:00:00.000Z'

const softDeleteStore: SoftDeletedRow[] = []
const activityStore = new Map<string, SyntheticActivity>()

function uuidLike(seed: string): string {
  // Cheap deterministic UUID derived from seed (only used for test fixtures).
  const hex = (seed + '00000000000000000000000000000000').replace(/[^a-z0-9]/gi, '').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function seedActivity(userId: string): SyntheticActivity {
  const cached = activityStore.get(userId)
  if (cached) return cached
  const orgId = FIXTURE_ORG_ID
  const own: AccountExportAuditEvent[] = [
    {
      id: uuidLike(`${userId}-audit-1`),
      organizationId: orgId,
      entityType: 'property',
      entityId: uuidLike(`${userId}-entity-1`),
      action: 'update',
      actorUserId: userId,
      metadata: { kind: 'self-edit' },
      createdAt: NOW_FIXED,
    },
  ]
  const foreign: AccountExportAuditEvent[] = [
    {
      id: uuidLike(`${userId}-foreign-1`),
      organizationId: orgId,
      entityType: 'membership',
      entityId: uuidLike(`${userId}-entity-2`),
      action: 'update',
      // Foreign actor — would leak another user's id if the export
      // didn't filter. The mock includes this row in
      // `foreignAuditEvents` so the test can assert exclusion.
      actorUserId: FIXTURE_USER_SUPER.userId,
      metadata: { kind: 'role-change', target: userId },
      createdAt: NOW_FIXED,
    },
  ]
  const out: SyntheticActivity = {
    userId,
    notifications: [
      {
        id: uuidLike(`${userId}-notif-1`),
        organizationId: orgId,
        eventType: 'quote.accepted',
        title: 'Quote accepted',
        body: 'A quote you authored was accepted.',
        severity: 'success',
        readAt: null,
        createdAt: NOW_FIXED,
      },
    ],
    subscriptions: [
      {
        organizationId: orgId,
        eventType: 'quote.accepted',
        channels: { inApp: true, email: true, sms: false },
        updatedAt: NOW_FIXED,
      },
    ],
    auditEvents: own,
    foreignAuditEvents: foreign,
  }
  activityStore.set(userId, out)
  return out
}

const ALL_FIXTURE_USERS = [
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUB,
  FIXTURE_USER_SUPER,
]

function fixtureFor(userId: string) {
  return ALL_FIXTURE_USERS.find((u) => u.userId === userId)
}

function findSoftDelete(userId: string): SoftDeletedRow | undefined {
  return softDeleteStore.find((r) => r.userId === userId)
}

function membershipsFor(userId: string): AccountExportMembership[] {
  const u = fixtureFor(userId)
  if (!u) return []
  return u.memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organizationName,
    role: m.role,
    isActive: true,
    joinedAt: NOW_FIXED,
  }))
}

function findSoleAdminOrgs(userId: string): string[] {
  const u = fixtureFor(userId)
  if (!u) return []
  const out: string[] = []
  for (const m of u.memberships) {
    if (m.role !== 'org_admin') continue
    // Count fixture admins in this org other than the requesting user.
    const others = ALL_FIXTURE_USERS.filter(
      (f) =>
        f.userId !== userId &&
        f.memberships.some(
          (fm) => fm.organizationId === m.organizationId && fm.role === 'org_admin',
        ),
    )
    if (others.length === 0) out.push(m.organizationId)
  }
  return out
}

export class MockAccountService implements IAccountService {
  async exportPersonalData(userId: string): Promise<AccountExport> {
    const u = fixtureFor(userId)
    if (!u) throw new Error(`Unknown user ${userId}`)
    const soft = findSoftDelete(userId)
    const activity = seedActivity(userId)

    // Scrub homeowner/sub links to empty arrays in the mock —
    // exercise the shape only.
    const homeownerLinks: AccountExportHomeownerLink[] = []
    const subcontractorLinks: AccountExportSubLink[] = []

    return {
      generatedAt: NOW_FIXED,
      schemaVersion: 1,
      notice:
        `This export contains your personal data only. Activity authored by other ` +
        `users is redacted to "${REDACTED_ACTOR}".`,
      profile: {
        userId: u.userId,
        email: soft ? `redacted-${u.userId}@deleted.invalid` : u.email,
        fullName: soft ? '' : u.fullName,
        avatarUrl: u.avatarUrl ?? null,
        isActive: !soft,
        createdAt: NOW_FIXED,
        updatedAt: NOW_FIXED,
        deletedAt: soft?.deletedAt ?? null,
      },
      memberships: membershipsFor(userId),
      homeownerLinks,
      subcontractorLinks,
      notifications: activity.notifications,
      notificationSubscriptions: activity.subscriptions,
      // Only the user's own audit events. Foreign rows are deliberately
      // excluded — the test asserts this.
      auditEvents: activity.auditEvents.slice(0, ACCOUNT_EXPORT_AUDIT_CAP),
      auditTruncated: activity.auditEvents.length > ACCOUNT_EXPORT_AUDIT_CAP,
    }
  }

  async requestDeletion(input: AccountDeletionRequest): Promise<AccountDeletionResult> {
    const u = fixtureFor(input.userId)
    if (!u) throw new Error(`Unknown user ${input.userId}`)
    const blockers = findSoleAdminOrgs(input.userId)
    if (blockers.length > 0) throw new SoleAdminError(blockers)
    const existing = findSoftDelete(input.userId)
    const now = new Date()
    const softDeletedAt = (existing?.deletedAt ?? now.toISOString())
    if (!existing) {
      softDeleteStore.push({
        userId: input.userId,
        deletedAt: softDeletedAt,
        scrubbed: { fullName: u.fullName, avatarUrl: u.avatarUrl ?? null },
      })
    }
    const hardDeleteAt = new Date(
      new Date(softDeletedAt).getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000,
    ).toISOString()
    return {
      userId: input.userId,
      softDeletedAt,
      hardDeleteScheduledFor: hardDeleteAt,
    }
  }

  async purgeExpiredDeletions(now?: Date): Promise<AccountPurgeResult> {
    const ref = (now ?? new Date()).getTime()
    const cutoff = ref - ACCOUNT_DELETION_GRACE_DAYS * 86_400_000
    const candidates = softDeleteStore.filter(
      (r) => new Date(r.deletedAt).getTime() <= cutoff,
    )
    for (const c of candidates) {
      const idx = softDeleteStore.findIndex((r) => r.userId === c.userId)
      if (idx >= 0) softDeleteStore.splice(idx, 1)
      activityStore.delete(c.userId)
    }
    return {
      scannedAt: new Date(ref).toISOString(),
      candidateCount: candidates.length,
      purgedCount: candidates.length,
    }
  }
}

/** Test helper — wipes soft-delete + activity state. */
export function __resetMockAccountForTests(): void {
  softDeleteStore.length = 0
  activityStore.clear()
}
