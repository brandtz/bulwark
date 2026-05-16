/**
 * shared/mocks/user.mock.ts — MockUserService (W2-4 / EH-H Part B / ADR-0021).
 *
 * # What this file does
 *   - In-memory implementation of `IUserService`. Seeds a member list from
 *     the fixture roster + maintains its own per-member status overrides
 *     (suspended, deactivated, role) so admin actions feel real in mock
 *     mode without retrofitting the auth fixtures.
 *
 * # Decisions (ADR-0008, ADR-0021)
 *   - **Local mutable state**, not a back-channel into MockAuthService.
 *     Auth fixtures stay read-only; admin actions land in `overrides`
 *     which `list()` layers on top.
 *   - **Status derivation rule** lives in `deriveStatus()` and matches
 *     the contract header.
 *   - **invite() mints a token compatible with the mock auth**: a
 *     base64url(JSON) shape so `MockAuthService.acceptInvite` (which
 *     already accepts this shape) Just Works. The rec also stores
 *     sha256(token) hex so the real-backend story stays consistent.
 *   - **userInvited** event fires on every successful invite call so
 *     the notification subscriber can react in tests.
 *   - **Tenant firewall** mirrors the rest of the mock fleet.
 */
import type {
  IUserService,
  InviteInput,
  InviteOutput,
  UserAdminRow,
  UserInviteRow,
  UserListInput,
  UserListOutput,
  UserMemberRow,
  UserStatus,
} from '../contracts/user'
import { assertSameTenant, type TenantResolver } from './tenant'
import { emit } from '../events/bus'
import { userInvited, type UserInvitedPayload } from '../events/catalog'
import type { Role } from '../contracts/_shared'
import {
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUB,
  FIXTURE_USER_SUPER,
} from './fixtures'

interface MemberOverride {
  id: string
  organizationId: string
  role?: Role
  userActive?: boolean
  membershipActive?: boolean
}

interface InviteRecord {
  id: string
  organizationId: string
  email: string
  role: Role
  invitedByUserId: string | null
  tokenHash: string
  rawToken: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

const overridesStore: MemberOverride[] = []
const invitesStore: InviteRecord[] = []

function findOverride(userId: string, orgId: string): MemberOverride | undefined {
  return overridesStore.find((o) => o.id === userId && o.organizationId === orgId)
}
function upsertOverride(patch: MemberOverride): void {
  const existing = findOverride(patch.id, patch.organizationId)
  if (existing) Object.assign(existing, patch)
  else overridesStore.push(patch)
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomTokenHex(byteLen = 32): string {
  // Used by resendInvite() to mint a fresh opaque token, matching the
  // real backend's behaviour even though the mock's primary token path
  // is the JWT-style mintMockInviteToken() (so MockAuthService can
  // round-trip it).
  const arr = new Uint8Array(byteLen)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Token shape compatible with MockAuthService.acceptInvite's verifyToken. */
function mintMockInviteToken(opts: {
  email: string
  organizationId: string
  organizationName: string
  role: Role
  expMs: number
}): string {
  const payload = {
    email: opts.email,
    kind: 'invite' as const,
    exp: opts.expMs,
    organizationId: opts.organizationId,
    organizationName: opts.organizationName,
    role: opts.role,
  }
  const json = JSON.stringify(payload)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deriveStatus(userActive: boolean, membershipActive: boolean): UserStatus {
  if (!userActive) return 'deactivated'
  if (!membershipActive) return 'suspended'
  return 'active'
}

const ALL_FIXTURE_USERS = [
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUB,
  FIXTURE_USER_SUPER,
]
const NOW_FIXED = '2026-05-15T00:00:00.000Z'

export class MockUserService implements IUserService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(input: UserListInput): Promise<UserListOutput> {
    assertSameTenant(this.resolver, input.organizationId)

    const out: UserAdminRow[] = []
    for (const u of ALL_FIXTURE_USERS) {
      const m = u.memberships.find((mm) => mm.organizationId === input.organizationId)
      if (!m) continue
      const o = findOverride(u.userId, input.organizationId)
      const role: Role = (o?.role ?? m.role) as Role
      const userActive = o?.userActive ?? true
      const membershipActive = o?.membershipActive ?? true
      const status = deriveStatus(userActive, membershipActive)
      const row: UserMemberRow = {
        kind: 'member',
        id: u.userId,
        membershipUserId: u.userId,
        organizationId: input.organizationId,
        email: u.email,
        fullName: u.fullName,
        role,
        status,
        avatarUrl: u.avatarUrl,
        createdAt: NOW_FIXED,
        updatedAt: NOW_FIXED,
        deletedAt: null,
      }
      if (input.role && row.role !== input.role) continue
      if (input.status && row.status !== input.status) continue
      out.push(row)
    }

    if (!input.status || input.status === 'invited') {
      for (const inv of invitesStore) {
        if (inv.organizationId !== input.organizationId) continue
        if (inv.acceptedAt || inv.revokedAt) continue
        if (input.role && inv.role !== input.role) continue
        const row: UserInviteRow = {
          kind: 'invite',
          id: inv.id,
          organizationId: inv.organizationId,
          email: inv.email,
          role: inv.role,
          status: 'invited',
          invitedByUserId: inv.invitedByUserId,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
          deletedAt: null,
        }
        out.push(row)
      }
    }

    return { users: out }
  }

  async invite(input: InviteInput): Promise<InviteOutput> {
    assertSameTenant(this.resolver, input.organizationId)
    const email = input.email.toLowerCase()
    const open = invitesStore.find(
      (i) =>
        i.organizationId === input.organizationId &&
        i.email === email &&
        !i.acceptedAt &&
        !i.revokedAt,
    )
    if (open) throw new Error('An open invite already exists for that email.')

    const expMs = Date.now() + 7 * 24 * 3600_000
    const orgName =
      ALL_FIXTURE_USERS.flatMap((u) => u.memberships).find(
        (m) => m.organizationId === input.organizationId,
      )?.organizationName ?? 'Bulwark Demo Co.'
    const rawToken = mintMockInviteToken({
      email,
      organizationId: input.organizationId,
      organizationName: orgName,
      role: input.role,
      expMs,
    })
    const tokenHash = await sha256Hex(rawToken)
    const now = new Date().toISOString()
    const rec: InviteRecord = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      email,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      tokenHash,
      rawToken,
      expiresAt: new Date(expMs).toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    invitesStore.push(rec)

    const payload: UserInvitedPayload = {
      organizationId: input.organizationId,
      entityId: rec.id,
      actorUserId: input.invitedByUserId,
      timestamp: now,
      email,
      role: input.role,
      inviteId: rec.id,
    }
    await emit(userInvited, payload)

    return {
      inviteId: rec.id,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async revokeInvite(inviteId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    const inv = invitesStore.find(
      (i) => i.id === inviteId && i.organizationId === organizationId,
    )
    if (!inv) throw new Error('Invite not found')
    if (inv.acceptedAt) throw new Error('Cannot revoke an accepted invite')
    inv.revokedAt = new Date().toISOString()
    inv.updatedAt = inv.revokedAt
  }

  async resendInvite(inviteId: string, organizationId: string): Promise<InviteOutput> {
    assertSameTenant(this.resolver, organizationId)
    const inv = invitesStore.find(
      (i) => i.id === inviteId && i.organizationId === organizationId,
    )
    if (!inv) throw new Error('Invite not found')
    if (inv.acceptedAt || inv.revokedAt) throw new Error('Invite is no longer open')
    // Mint a fresh token, matching real backend behaviour.
    const rawToken = randomTokenHex()
    inv.rawToken = rawToken
    inv.tokenHash = await sha256Hex(rawToken)
    inv.expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
    inv.updatedAt = new Date().toISOString()
    return {
      inviteId: inv.id,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      inviteToken: rawToken,
    }
  }

  async setRole(input: { organizationId: string; userId: string; role: Role }): Promise<void> {
    assertSameTenant(this.resolver, input.organizationId)
    upsertOverride({ id: input.userId, organizationId: input.organizationId, role: input.role })
  }

  async suspend(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    upsertOverride({ id: userId, organizationId, membershipActive: false })
  }

  async reactivate(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    upsertOverride({ id: userId, organizationId, membershipActive: true, userActive: true })
  }

  async deactivate(userId: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    upsertOverride({ id: userId, organizationId, userActive: false })
  }

  async transferOwnership(input: {
    organizationId: string
    newOwnerUserId: string
  }): Promise<void> {
    assertSameTenant(this.resolver, input.organizationId)
    // Actor must be super_admin (a Bulwark-internal role); enforced here
    // to mirror the real backend's gate.
    const ctx = this.resolver?.()
    const actor = ALL_FIXTURE_USERS.find((u) => u.userId === ctx?.userId)
    const actorMembership = actor?.memberships.find(
      (m) => m.organizationId === input.organizationId,
    )
    if (actorMembership?.role !== 'super_admin') {
      throw new Error('Only super_admin can transfer ownership.')
    }
    upsertOverride({
      id: input.newOwnerUserId,
      organizationId: input.organizationId,
      role: 'org_admin',
    })
    if (ctx?.userId) {
      upsertOverride({
        id: ctx.userId,
        organizationId: input.organizationId,
        role: 'org_manager',
      })
    }
  }
}

export function __resetMockUsersForTests(): void {
  overridesStore.length = 0
  invitesStore.length = 0
}
