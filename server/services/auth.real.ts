/**
 * server/services/auth.real.ts — RealAuthService (E11-S3).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Passwords hashed with **bcryptjs** (`$2a$12$...`). Pure-JS so it
 *     runs on Vercel's Node runtime without native bindings — the
 *     argon2/native-bcrypt route requires custom build steps we don't
 *     want for a Phase 2 MVP.
 *   - Reset + invite tokens are **stateless signed JWTs** (`jose`),
 *     keyed off `JWT_SECRET` (or `NUXT_SESSION_PASSWORD` as fallback in
 *     dev). No `password_resets` table — verification is purely "did
 *     this server sign it, and is `exp` in the future?" That's enough
 *     for MVP and avoids a whole table + cleanup cron.
 *   - **Session storage is delegated** to a `RealAuthSessionAdapter`
 *     interface. The adapter holds (a) the active user's UUID and (b)
 *     an optional active-org override. Production wiring (E11-S4) will
 *     back the adapter with `nuxt-auth-utils` `setUserSession()`. Tests
 *     supply an in-memory adapter so the service stays unit-testable.
 *   - `currentUser()` always **re-reads memberships from the DB** rather
 *     than trusting whatever was stamped at login. Keeps the UI honest
 *     when an admin revokes a membership mid-session.
 *
 * # Decisions cast down
 *   - Storing the full SessionUser in the cookie. Rejected — a cookie
 *     containing the role is a free privilege-escalation surface if a
 *     bug ever lets the client mutate it. Cookie holds only `userId`;
 *     everything else is derived from the DB on each request.
 *   - argon2id. Rejected for Phase 2 — Vercel deploy + serverless cold
 *     start adds friction we don't need yet. Re-evaluate when we move
 *     off Vercel or pull native modules in for other reasons.
 *   - Returning the JWT as the only "did we send the email?" signal.
 *     Kept (`devToken` in the result) but ONLY in dev/test. Production
 *     wiring strips it before sending the response (E11-S4).
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { and, desc, eq, gte } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type {
  IAuthService,
  AuthResult,
  AuthLoginResult,
  AuthAttemptRow,
  GetAttemptsInput,
  LockoutState,
  LoginInput,
  SessionUser,
  RequestPasswordResetInput,
  RequestPasswordResetResult,
  ResetPasswordInput,
  ChangePasswordInput,
  AcceptInviteInput,
  InvitePreview,
} from '../../shared/contracts/auth'
import {
  AcceptInviteInputSchema,
  LoginInputSchema,
  RequestPasswordResetInputSchema,
  ResetPasswordInputSchema,
  ChangePasswordInputSchema,
} from '../../shared/contracts/auth'
import { getDb } from '../db/client'
import { users, memberships } from '../db/schema/users'
import { organizations } from '../db/schema/organizations'
import { pendingInvites } from '../db/schema/pending_invites'
import { authAttempts } from '../db/schema/auth_attempts'
import { seedDefaultNotifications } from './notification-subscription.real'
import { RealMfaService } from './mfa.real'

export interface RealAuthSessionAdapter {
  getActiveUserId(): Promise<string | null> | string | null
  setActiveUserId(userId: string | null): Promise<void> | void
  getActiveOrgOverride(): Promise<string | null> | string | null
  setActiveOrgOverride(organizationId: string | null): Promise<void> | void
}

/** In-memory adapter used by tests + by `withRealAuth()` helpers. */
export class InMemoryAuthSessionAdapter implements RealAuthSessionAdapter {
  private userId: string | null = null
  private orgOverride: string | null = null
  getActiveUserId() { return this.userId }
  setActiveUserId(id: string | null) { this.userId = id }
  getActiveOrgOverride() { return this.orgOverride }
  setActiveOrgOverride(id: string | null) { this.orgOverride = id }
}

const RESET_TTL_MS = 60 * 60 * 1000   // 1 hour
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000   // 7 days
const BCRYPT_ROUNDS = 12

// --- Lockout policy (W2-5 / ADR-0023) ---------------------------------------
// System defaults; per-org overrides via org_settings land once the user
// is identified, but the pre-auth lockout count uses these globals.
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_DURATION_MS = 30 * 60 * 1000
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000

function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET ?? process.env.NUXT_SESSION_PASSWORD
  if (!raw || raw.length < 16) {
    throw new Error('JWT_SECRET (or NUXT_SESSION_PASSWORD) must be set and >=16 chars')
  }
  return new TextEncoder().encode(raw)
}

async function signToken(payload: Record<string, unknown>, ttlMs: number): Promise<string> {
  const exp = Math.floor((Date.now() + ttlMs) / 1000)
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getJwtSecret())
}

interface ResetPayload { kind: 'reset'; userId: string }
interface MfaTokenPayload { kind: 'mfa'; userId: string }
interface InvitePayload {
  kind: 'invite'
  email: string
  organizationId: string
  organizationName: string
  role: SessionUser['activeRole']
}

async function verifyTokenOfKind<T extends { kind: string }>(token: string, kind: T['kind']): Promise<T> {
  let payload: Record<string, unknown>
  try {
    const { payload: p } = await jwtVerify(token, getJwtSecret())
    payload = p as Record<string, unknown>
  } catch {
    throw new Error('This link is invalid or expired. Request a new one.')
  }
  if (payload.kind !== kind) throw new Error('This link is for a different action.')
  return payload as unknown as T
}

export class RealAuthService implements IAuthService {
  constructor(private readonly adapter: RealAuthSessionAdapter) {}

  // --- bcrypt helpers (exported for the seed script) ----------------------
  static async hashPassword(plain: string): Promise<string> {
    return await bcrypt.hash(plain, BCRYPT_ROUNDS)
  }

  // --- core session lifecycle ---------------------------------------------
  async login(input: LoginInput, opts?: { ipAddress?: string | null }): Promise<AuthLoginResult> {
    // W5-3 / ADR-0037: Zod-parse at the boundary. This method is hit
    // unauthenticated through the RPC dispatcher, which does not
    // validate args. Reject non-conforming payloads before any DB or
    // bcrypt work happens.
    input = LoginInputSchema.parse(input)
    const db = getDb()
    const email = input.email.toLowerCase()
    const ipAddress = opts?.ipAddress ?? null

    // Pre-flight lockout check (uses globals; can't pull org overrides
    // before we know the user).
    const lock = await this.getLockoutState({ email })
    if (lock.locked) {
      await db.insert(authAttempts).values({ email, ipAddress, success: false, reason: 'locked' })
      const retryAfterSeconds = Math.max(1, Math.ceil(((lock.until ?? Date.now()) - Date.now()) / 1000))
      const err = new Error('account_locked') as Error & { retryAfterSeconds?: number }
      err.retryAfterSeconds = retryAfterSeconds
      throw err
    }

    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    // Constant-ish-time: always run a bcrypt compare so timing doesn't
    // distinguish "no such user" from "wrong password".
    const hash = row?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000'
    const ok = await bcrypt.compare(input.password, hash)

    if (!row || !row.isActive || !row.passwordHash || !ok) {
      const reason = !row ? 'unknown_user' : !row.isActive ? 'inactive' : 'bad_password'
      await db.insert(authAttempts).values({ email, ipAddress, success: false, reason })
      throw new Error('Invalid email or password')
    }

    // Password OK — check MFA status BEFORE issuing the session.
    const mfa = new RealMfaService()
    const status = await mfa.getStatus(row.id)
    if (status.enabled) {
      // Don't record this as a success yet — issue a step-up token.
      await db.insert(authAttempts).values({ email, ipAddress, success: false, reason: 'mfa_required' })
      const mfaToken = await signToken({ kind: 'mfa', userId: row.id } satisfies MfaTokenPayload, MFA_TOKEN_TTL_MS)
      return { kind: 'mfa_required', mfaToken, email }
    }

    await db.insert(authAttempts).values({ email, ipAddress, success: true, reason: null })
    await this.adapter.setActiveUserId(row.id)
    await this.adapter.setActiveOrgOverride(null)
    const session = await this.buildSessionUser(row.id)
    if (!session) throw new Error('Account has no active memberships')
    return { kind: 'session', user: session }
  }

  async verifyMfa(mfaToken: string, code: string, opts?: { ipAddress?: string | null }): Promise<AuthResult> {
    const payload = await verifyTokenOfKind<MfaTokenPayload>(mfaToken, 'mfa')
    const db = getDb()
    const ipAddress = opts?.ipAddress ?? null
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
    if (!user || !user.isActive) {
      throw new Error('Account not found or inactive')
    }
    const mfa = new RealMfaService()
    let ok = (await mfa.verifyTotp(payload.userId, code)).ok
    let usedBackup = false
    if (!ok) {
      const consumed = await mfa.consumeBackupCode(payload.userId, code)
      ok = consumed.ok
      usedBackup = consumed.ok
    }
    if (!ok) {
      await db.insert(authAttempts).values({
        email: user.email,
        ipAddress,
        success: false,
        reason: 'mfa_bad_code',
      })
      throw new Error('Invalid authentication code')
    }
    await db.insert(authAttempts).values({
      email: user.email,
      ipAddress,
      success: true,
      reason: usedBackup ? 'mfa_backup' : 'mfa_totp',
    })
    await this.adapter.setActiveUserId(user.id)
    await this.adapter.setActiveOrgOverride(null)
    const session = await this.buildSessionUser(user.id)
    if (!session) throw new Error('Account has no active memberships')
    return { user: session }
  }

  async logout(): Promise<void> {
    // Order matters: setActiveUserId(null) calls clearUserSession on the H3
    // adapter, which writes a Set-Cookie max-age=0. Calling
    // setActiveOrgOverride(null) AFTER that triggers a fresh getUserSession,
    // which lazily resurrects a new sealed session id and emits a brand-new
    // Set-Cookie on the response — silently undoing the logout. Skip the
    // override clear since clearUserSession already wipes everything.
    await this.adapter.setActiveUserId(null)
  }

  async currentUser(): Promise<SessionUser | null> {
    const userId = await this.adapter.getActiveUserId()
    if (!userId) return null
    return await this.buildSessionUser(userId)
  }

  async switchActiveOrg(organizationId: string): Promise<SessionUser> {
    const userId = await this.adapter.getActiveUserId()
    if (!userId) throw new Error('Not signed in')
    const session = await this.buildSessionUser(userId)
    if (!session) throw new Error('Account has no active memberships')
    const m = session.memberships.find((mm) => mm.organizationId === organizationId)
    if (!m) throw new Error('You are not a member of that organization')
    await this.adapter.setActiveOrgOverride(organizationId)
    return { ...session, activeOrganizationId: organizationId, activeRole: m.role }
  }

  // --- password reset -----------------------------------------------------
  async requestPasswordReset(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult> {
    // W5-3 / ADR-0037: Zod-parse at the boundary (unauthenticated entry).
    input = RequestPasswordResetInputSchema.parse(input)
    const db = getDb()
    const [row] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1)
    if (!row || !row.isActive) {
      // Same-shape success so we don't leak account existence.
      return { devToken: null }
    }
    const token = await signToken({ kind: 'reset', userId: row.id } satisfies ResetPayload, RESET_TTL_MS)
    // E11-S4 will swap the response: caller-side strip in production,
    // keep `devToken` in dev so Playwright can click straight through.
    const isProd = process.env.NODE_ENV === 'production'
    return { devToken: isProd ? null : token }
  }

  async resetPassword(input: ResetPasswordInput): Promise<AuthResult> {
    // W5-3 / ADR-0037: Zod-parse at the boundary (unauthenticated entry).
    input = ResetPasswordInputSchema.parse(input)
    const payload = await verifyTokenOfKind<ResetPayload>(input.token, 'reset')
    const newHash = await RealAuthService.hashPassword(input.newPassword)
    const db = getDb()
    const [updated] = await db
      .update(users)
      .set({ passwordHash: newHash })
      .where(and(eq(users.id, payload.userId), eq(users.isActive, true)))
      .returning({ id: users.id })
    if (!updated) throw new Error('Account not found or inactive')
    await this.adapter.setActiveUserId(updated.id)
    await this.adapter.setActiveOrgOverride(null)
    const session = await this.buildSessionUser(updated.id)
    if (!session) throw new Error('Account has no active memberships')
    return { user: session }
  }

  // --- Authenticated password change (E11 profile completion) -------------
  //
  // The user is signed in. We re-verify the current password (bcrypt
  // compare) as a knowledge factor before applying the new hash, so an
  // attacker who finds an unattended browser cannot pivot. Failures are
  // generic ("Current password is incorrect") to avoid timing leaks; the
  // bcrypt.compare itself dominates the timing envelope.
  async changePassword(input: ChangePasswordInput): Promise<void> {
    input = ChangePasswordInputSchema.parse(input)
    const userId = await this.adapter.getActiveUserId()
    if (!userId) throw new Error('Not authenticated')
    const db = getDb()
    const [row] = await db
      .select({ id: users.id, hash: users.passwordHash, active: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!row || !row.active) throw new Error('Account not found or inactive')
    const ok = await bcrypt.compare(input.currentPassword, row.hash ?? '')
    if (!ok) throw new Error('Current password is incorrect')
    const newHash = await RealAuthService.hashPassword(input.newPassword)
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, row.id))
  }

  // --- invitations --------------------------------------------------------
  async previewInvite(token: string): Promise<InvitePreview> {
    // W2-4: opaque hex tokens first (pending_invites table); fall back
    // to legacy JWT for tokens minted before EH-H Part B.
    const opaque = await tryPreviewOpaqueInvite(token)
    if (opaque) return opaque
    const p = await verifyTokenOfKind<InvitePayload>(token, 'invite')
    return { email: p.email, organizationName: p.organizationName, role: p.role }
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthResult> {
    // W5-3 / ADR-0037: Zod-parse at the boundary (unauthenticated entry).
    input = AcceptInviteInputSchema.parse(input)
    // W2-4: opaque-token path uses pending_invites; legacy JWT fallback.
    const opaque = await tryConsumeOpaqueInvite(input.token)
    const p: InvitePayload = opaque
      ?? (await verifyTokenOfKind<InvitePayload>(input.token, 'invite'))
    const db = getDb()
    const passwordHash = await RealAuthService.hashPassword(input.password)

    // Upsert the user, then ensure a membership row exists.
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, p.email.toLowerCase()))
      .limit(1)

    let userId: string
    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ fullName: input.fullName, passwordHash, isActive: true })
        .where(eq(users.id, existing.id))
        .returning({ id: users.id })
      userId = updated!.id
    } else {
      const [inserted] = await db
        .insert(users)
        .values({ email: p.email.toLowerCase(), fullName: input.fullName, passwordHash, isActive: true })
        .returning({ id: users.id })
      userId = inserted!.id
    }

    // Idempotent membership row.
    const [hasMembership] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, p.organizationId)))
      .limit(1)
    if (!hasMembership) {
      await db.insert(memberships).values({
        userId,
        organizationId: p.organizationId,
        role: p.role,
        isActive: true,
      })
    } else {
      await db
        .update(memberships)
        .set({ role: p.role, isActive: true })
        .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, p.organizationId)))
    }

    await this.adapter.setActiveUserId(userId)
    await this.adapter.setActiveOrgOverride(null)
    // W2-4: seed default notification preferences for the new user.
    // Idempotent: real impl uses onConflictDoNothing.
    try {
      await seedDefaultNotifications({ organizationId: p.organizationId, userId })
    } catch {
      // Don't block invite acceptance on notification seeding.
    }
    const session = await this.buildSessionUser(userId)
    if (!session) throw new Error('Membership creation failed')
    return { user: session }
  }

  // --- internals ----------------------------------------------------------
  private async buildSessionUser(userId: string): Promise<SessionUser | null> {
    const db = getDb()
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!user) return null

    const rows = await db
      .select({
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true)))

    if (rows.length === 0) return null

    const override = await this.adapter.getActiveOrgOverride()
    const validOverride = override && rows.some((r) => r.organizationId === override) ? override : null
    const active = validOverride
      ? rows.find((r) => r.organizationId === validOverride)!
      : rows[0]!

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      activeOrganizationId: active.organizationId,
      activeRole: active.role,
      memberships: rows.map((r) => ({
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        role: r.role,
      })),
    }
  }

  // --- W2-5: attempt log + lockout state ----------------------------------
  async getAttempts(input: GetAttemptsInput): Promise<{ attempts: AuthAttemptRow[] }> {
    const db = getDb()
    const limit = input.limit ?? 100
    const conds = []
    if (input.email) conds.push(eq(authAttempts.email, input.email.toLowerCase()))
    // organizationId + userId are accepted by the contract for forward compat
    // but auth_attempts is intentionally pre-tenant. We resolve userId → email
    // when present.
    if (input.userId) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1)
      if (u) conds.push(eq(authAttempts.email, u.email))
    }
    const rows = await db
      .select()
      .from(authAttempts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(authAttempts.occurredAt))
      .limit(limit)
    return {
      attempts: rows.map((r) => ({
        id: r.id,
        email: r.email,
        ipAddress: r.ipAddress,
        success: r.success,
        reason: r.reason,
        occurredAt: r.occurredAt.toISOString(),
      })),
    }
  }

  async getLockoutState(input: { email: string }): Promise<LockoutState> {
    const db = getDb()
    const email = input.email.toLowerCase()
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS)
    const rows = await db
      .select()
      .from(authAttempts)
      .where(and(eq(authAttempts.email, email), gte(authAttempts.occurredAt, windowStart)))
      .orderBy(desc(authAttempts.occurredAt))
    // Count consecutive failures from most-recent backwards until a success.
    let failures = 0
    let lastFailureAt: Date | null = null
    for (const r of rows) {
      if (r.success) break
      // Treat 'mfa_required' as a non-counting waypoint (password was correct).
      if (r.reason === 'mfa_required') continue
      failures++
      lastFailureAt = lastFailureAt ?? r.occurredAt
    }
    if (failures >= LOCKOUT_THRESHOLD && lastFailureAt) {
      const until = lastFailureAt.getTime() + LOCKOUT_DURATION_MS
      if (until > Date.now()) {
        return { locked: true, until, attemptsRemaining: 0 }
      }
    }
    return {
      locked: false,
      until: null,
      attemptsRemaining: Math.max(0, LOCKOUT_THRESHOLD - failures),
    }
  }
}

/**
 * Helper used by tooling/tests/admin paths to mint an invite link without
 * an admin UI. Not part of `IAuthService`.
 */
export async function mintInviteToken(opts: {
  email: string
  organizationId: string
  organizationName: string
  role: SessionUser['activeRole']
  ttlMs?: number
}): Promise<string> {
  return await signToken(
    {
      kind: 'invite',
      email: opts.email.toLowerCase(),
      organizationId: opts.organizationId,
      organizationName: opts.organizationName,
      role: opts.role,
    } satisfies InvitePayload,
    opts.ttlMs ?? INVITE_TTL_MS,
  )
}

// ---------------------------------------------------------------------------
// W2-4 opaque-token invite path. The user-admin UI mints `randomBytes(32).hex`
// tokens and stores `sha256(token)` in `pending_invites`. These helpers look
// the token up so `acceptInvite` can consume it.
// ---------------------------------------------------------------------------
function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

async function tryPreviewOpaqueInvite(token: string): Promise<InvitePreview | null> {
  const db = getDb()
  const hash = hashInviteToken(token)
  const [row] = await db
    .select({
      email: pendingInvites.email,
      role: pendingInvites.role,
      organizationId: pendingInvites.organizationId,
      expiresAt: pendingInvites.expiresAt,
      acceptedAt: pendingInvites.acceptedAt,
      revokedAt: pendingInvites.revokedAt,
    })
    .from(pendingInvites)
    .where(eq(pendingInvites.tokenHash, hash))
    .limit(1)
  if (!row) return null
  if (row.acceptedAt || row.revokedAt) {
    throw new Error('This invite is no longer valid. Ask an admin for a new one.')
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new Error('This invite has expired. Ask an admin for a new one.')
  }
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1)
  return {
    email: row.email,
    role: row.role,
    organizationName: org?.name ?? 'your organization',
  }
}

async function tryConsumeOpaqueInvite(token: string): Promise<InvitePayload | null> {
  const db = getDb()
  const hash = hashInviteToken(token)
  const [row] = await db
    .select()
    .from(pendingInvites)
    .where(eq(pendingInvites.tokenHash, hash))
    .limit(1)
  if (!row) return null
  if (row.acceptedAt || row.revokedAt) {
    throw new Error('This invite is no longer valid. Ask an admin for a new one.')
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new Error('This invite has expired. Ask an admin for a new one.')
  }
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1)
  // Mark as accepted now — even if the upsert below fails, a partially
  // consumed invite can't be re-used.
  await db
    .update(pendingInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(pendingInvites.id, row.id))
  return {
    kind: 'invite',
    email: row.email,
    organizationId: row.organizationId,
    organizationName: org?.name ?? 'your organization',
    role: row.role,
  }
}
