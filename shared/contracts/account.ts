/**
 * shared/contracts/account.ts — Data Subject Rights (DSR) contract
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - Encodes the per-user "export my data" payload shape and the
 *     "delete my account" request shape that satisfy GDPR Art. 15
 *     (access), Art. 17 (erasure), Art. 20 (portability) and CCPA
 *     §1798.100-.105 (right-to-know + right-to-delete).
 *   - Declares `IAccountService` which both `MockAccountService` and
 *     `RealAccountService` implement, keeping the UI's `/profile/data`
 *     surface impl-agnostic.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **One export, machine-readable JSON.** Phase 1 ships a single
 *     download artifact. Per-table CSV breakouts and PDF receipts are
 *     deferred — JSON satisfies "structured, commonly used,
 *     machine-readable" verbatim from the GDPR text.
 *   - **Other users redacted as `[user]`.** When the requesting user's
 *     audit history references *another* actor (e.g., the admin who
 *     invited them), the export replaces that name/email with the
 *     fixed string `[user]`. We never expand someone else's PII inside
 *     a DSR export. The redacted-actor placeholder is documented in
 *     the privacy policy.
 *   - **Soft-delete + 30-day grace.** `requestDeletion()` flips
 *     `users.deleted_at`, NULLs PII columns (name, phone, avatar) but
 *     keeps a hash of the prior email for fraud / abuse correlation
 *     (lawful basis: legitimate interest under GDPR Art. 6(1)(f);
 *     CCPA §1798.105(d)(2) fraud-prevention exception). The
 *     `purgeExpiredDeletions()` job hard-deletes the row 30 days later.
 *   - **Sole-admin block.** If the requesting user is the only
 *     `org_admin` of an org, deletion is refused with a clear error so
 *     the org isn't orphaned. The user must transfer ownership first.
 *
 * # Decisions NOT taken
 *   - Per-org export. The export is keyed on `userId`, not
 *     `(userId, organizationId)`. A user with memberships in multiple
 *     orgs gets a single JSON containing all of their data; org-side
 *     business records (properties, quotes, invoices, audit-log rows
 *     about *the org's* work) are NOT included — those belong to the
 *     org as data controller, not to the user as data subject.
 *   - Live streaming. Exports are bounded by a `maxAuditRows` ceiling
 *     so the JSON payload stays under a typical 10MB browser-download
 *     comfort line. A power user with more activity gets a notice.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Export schema. Shape matches the JSON file the user downloads.
// ----------------------------------------------------------------------------

export const AccountExportProfileSchema = z.object({
  userId: UuidSchema,
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
})
export type AccountExportProfile = z.infer<typeof AccountExportProfileSchema>

export const AccountExportMembershipSchema = z.object({
  organizationId: UuidSchema,
  organizationName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  joinedAt: z.string().datetime(),
})
export type AccountExportMembership = z.infer<typeof AccountExportMembershipSchema>

export const AccountExportHomeownerLinkSchema = z.object({
  homeownerUserId: UuidSchema,
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  /** Property address line so the export is human-readable. */
  propertyAddress: z.string().nullable(),
  kind: z.string(),
  invitedAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
})
export type AccountExportHomeownerLink = z.infer<typeof AccountExportHomeownerLinkSchema>

export const AccountExportSubLinkSchema = z.object({
  subcontractorUserId: UuidSchema,
  organizationId: UuidSchema,
  subcontractorId: UuidSchema,
  subcontractorName: z.string().nullable(),
  invitedAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
})
export type AccountExportSubLink = z.infer<typeof AccountExportSubLinkSchema>

export const AccountExportNotificationSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  eventType: z.string(),
  title: z.string(),
  body: z.string(),
  severity: z.string(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type AccountExportNotification = z.infer<typeof AccountExportNotificationSchema>

export const AccountExportSubscriptionSchema = z.object({
  organizationId: UuidSchema,
  eventType: z.string(),
  channels: z.object({
    inApp: z.boolean(),
    email: z.boolean(),
    sms: z.boolean(),
  }),
  updatedAt: z.string().datetime(),
})
export type AccountExportSubscription = z.infer<typeof AccountExportSubscriptionSchema>

export const AccountExportAuditEventSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  entityType: z.string(),
  entityId: UuidSchema,
  action: z.string(),
  /** Always the requesting user; included for completeness. */
  actorUserId: UuidSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
})
export type AccountExportAuditEvent = z.infer<typeof AccountExportAuditEventSchema>

export const AccountExportSchema = z.object({
  /** When the export was generated. */
  generatedAt: z.string().datetime(),
  /** Privacy notice + redaction policy embedded so the file is self-describing. */
  notice: z.string(),
  /** Schema version — bump on shape change so consumers can branch. */
  schemaVersion: z.literal(1),
  profile: AccountExportProfileSchema,
  memberships: z.array(AccountExportMembershipSchema),
  homeownerLinks: z.array(AccountExportHomeownerLinkSchema),
  subcontractorLinks: z.array(AccountExportSubLinkSchema),
  notifications: z.array(AccountExportNotificationSchema),
  notificationSubscriptions: z.array(AccountExportSubscriptionSchema),
  /** Audit events authored BY this user (actor_user_id = userId). */
  auditEvents: z.array(AccountExportAuditEventSchema),
  /** True when the audit-row count hit the cap; user can request the rest manually. */
  auditTruncated: z.boolean(),
})
export type AccountExport = z.infer<typeof AccountExportSchema>

// ----------------------------------------------------------------------------
// Deletion request inputs / outputs.
// ----------------------------------------------------------------------------

export const AccountDeletionRequestSchema = z.object({
  /** The acting user requests deletion of THEIR OWN account. */
  userId: UuidSchema,
  /** Optional free-text reason captured in the audit event. */
  reason: z.string().max(500).optional(),
})
export type AccountDeletionRequest = z.infer<typeof AccountDeletionRequestSchema>

export const AccountDeletionResultSchema = z.object({
  userId: UuidSchema,
  softDeletedAt: z.string().datetime(),
  /** When the row will be hard-deleted by the purge job. */
  hardDeleteScheduledFor: z.string().datetime(),
})
export type AccountDeletionResult = z.infer<typeof AccountDeletionResultSchema>

export const AccountPurgeResultSchema = z.object({
  scannedAt: z.string().datetime(),
  candidateCount: z.number().int().nonnegative(),
  purgedCount: z.number().int().nonnegative(),
})
export type AccountPurgeResult = z.infer<typeof AccountPurgeResultSchema>

/** Grace period between soft-delete and hard-delete. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30

/** Cap on audit events embedded in a single export. */
export const ACCOUNT_EXPORT_AUDIT_CAP = 5000

/** The fixed placeholder used to redact other users' identities in exports. */
export const REDACTED_ACTOR = '[user]'

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------

export interface IAccountService {
  /**
   * Build the per-user data export. The caller MUST verify that
   * `userId` matches the active session before invoking; the service
   * trusts the caller for identity but enforces tenancy for the data
   * it pulls in.
   */
  exportPersonalData(userId: string): Promise<AccountExport>

  /**
   * Soft-delete a user account. NULLs PII columns, sets `deleted_at`,
   * writes a `security.account_deletion_requested` audit event.
   *
   * Throws if the user is the sole `org_admin` of any org they belong
   * to (`SoleAdminError` — caller renders the "transfer ownership"
   * UX).
   */
  requestDeletion(input: AccountDeletionRequest): Promise<AccountDeletionResult>

  /**
   * Hard-delete user rows whose soft-delete grace period has elapsed.
   * Idempotent. Returns a tally for the cron handler / admin
   * dashboard. NOT exposed via the user-facing API — only the daily
   * job (or a manual admin trigger) calls this.
   */
  purgeExpiredDeletions(now?: Date): Promise<AccountPurgeResult>
}

/** Distinguishable error so the API endpoint can return 409 + a clear code. */
export class SoleAdminError extends Error {
  readonly code = 'SOLE_ADMIN'
  constructor(public readonly organizationIds: string[]) {
    super(
      `Cannot delete: you are the sole org_admin of ${organizationIds.length} organization(s). Transfer admin role first.`,
    )
    this.name = 'SoleAdminError'
  }
}
