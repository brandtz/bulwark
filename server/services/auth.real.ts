/**
 * server/services/auth.real.ts — RealAuthService (E11-S3).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Passwords hashed with **bcryptjs** (`$2a$12$...`). Pure-JS so it
 *     runs on Vercel's Node runtime without native bindings — the
 *     argon2/native-bcrypt route requires custom build steps we don't
 *     want for a Phase 2 MVP.
 *   - Password-reset tokens are stateless signed JWTs (`jose`), keyed
 *     off `JWT_SECRET` (or `NUXT_SESSION_PASSWORD` as fallback in dev).
 *     Admin-created invite tokens are opaque and stored as SHA-256 hashes
 *     in `pending_invites`; legacy JWT invites remain accepted temporarily.
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
 *   - Returning the password-reset JWT to the caller. Kept as `devToken`
 *     only outside production; production sends the link through the
 *     organization email provider and never returns the token.
 */
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
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
import { loadPolicyForUser } from './security-policy.real'
import type { SecurityPolicy } from '../../shared/contracts/security-policy'
import { sendEmail } from './_providers/email'
import { buildAuthLink, escapeEmailHtml } from './_providers/auth-links'
import { signAssetUrl } from './storage/asset-urls'
import { COUNTERS, incCounter } from '../utils/metrics'
import { revokeUserSessions } from './session.real'

export interface RealAuthSessionAdapter {
  getActiveUserId(): Promise<string | null> | string | null
  setActiveUserId(userId: string | null, options?: { maxAgeSeconds?: number }): Promise<void> | void
  getActiveOrgOverride(): Promise<string | null> | string | null
  setActiveOrgOverride(organizationId: string | null): Promise<void> | void
  /** WP-X2 / ED-015: the user_sessions row behind the current cookie, when tracked. */
  getSessionId?(): Promise<string | null> | string | null
}

/** In-memory adapter used by tests + by `withRealAuth()` helpers. */
export class InMemoryAuthSessionAdapter implements RealAuthSessionAdapter {
  private userId: string | null = null
  private orgOverride: string | null = null
  lastMaxAgeSeconds: number | undefined
  getActiveUserId() { return this.userId }
  setActiveUserId(id: string | null, options?: { maxAgeSeconds?: number }) {
    this.userId = id
    this.lastMaxAgeSeconds = options?.maxAgeSeconds
  }
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
const REMEMBER_ME_SESSION_SECONDS = 30 * 24 * 60 * 60

/**
 * WP-L07 S2: "Keep me signed in" lasts the organization's trusted-device
 * lifetime, and is ignored when the organization sets an idle timeout (ED-001).
 */
function persistentSessionFor(rememberMe: boolean | undefined, policy: SecurityPolicy | null): { maxAgeSeconds: number } | undefined {
  if (!rememberMe || policy?.idleMinutes) return undefined
  return { maxAgeSeconds: policy ? policy.trustedDays * 24 * 60 * 60 : REMEMBER_ME_SESSION_SECONDS }
}

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

// `pwd` fingerprints the password hash at issue time, so a reset link stops working once any
// password change lands (single use, and revoked by a later reset or change).
interface ResetPayload { kind: 'reset'; userId: string; pwd?: string }

function passwordFingerprint(passwordHash: string | null): string {
  return createHash('sha256').update(`reset:${passwordHash ?? ''}`).digest('hex').slice(0, 32)
}
interface MfaTokenPayload { kind: 'mfa'; userId: string; rememberMe?: boolean }
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
  constructor(
    private readonly adapter: RealAuthSessionAdapter,
    private readonly emailSender: typeof sendEmail = sendEmail,
  ) {}

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

    // Pre-flight lockout (WP-L07 review): one platform-wide threshold for
    // every email, known or not, so the lock itself cannot reveal whether an
    // account exists. The organization's own (possibly stricter) threshold
    // is applied only after a correct password, below.
    const lock = await this.getLockoutState({ email })
    if (lock.locked) await this.refuseLocked(email, ipAddress, lock)

    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    // Constant-ish-time: always run a bcrypt compare so timing doesn't
    // distinguish "no such user" from "wrong password".
    const hash = row?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000'
    const ok = await bcrypt.compare(input.password, hash)

    if (!row || !row.isActive || !row.passwordHash || !ok) {
      const reason = !row ? 'unknown_user' : !row.isActive ? 'inactive' : 'bad_password'
      await db.insert(authAttempts).values({ email, ipAddress, success: false, reason })
      incCounter(COUNTERS.authFailuresTotal)
      throw new Error('Invalid email or password')
    }

    // Password OK: now the org's lockout thresholds (ED-056) apply.
    const policy = await loadPolicyForUser(row.id)
    if (policy) {
      const orgLock = await this.getLockoutState({ email }, policy)
      if (orgLock.locked) await this.refuseLocked(email, ipAddress, orgLock)
    }

    // Check MFA status BEFORE issuing the session.
    const mfa = new RealMfaService()
    const status = await mfa.getStatus(row.id)
    if (status.enabled) {
      // Don't record this as a success yet — issue a step-up token.
      await db.insert(authAttempts).values({ email, ipAddress, success: false, reason: 'mfa_required' })
      const mfaToken = await signToken({ kind: 'mfa', userId: row.id, rememberMe: input.rememberMe } satisfies MfaTokenPayload, MFA_TOKEN_TTL_MS)
      return { kind: 'mfa_required', mfaToken, email }
    }

    await db.insert(authAttempts).values({ email, ipAddress, success: true, reason: null })
    await this.adapter.setActiveUserId(row.id, persistentSessionFor(input.rememberMe, policy))
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
    // The step-up code is guessable too: the same lockout guards it
    // (WP-L07 review), counted on the account's email.
    const mfaLock = await this.getLockoutState({ email: user.email }, (await loadPolicyForUser(user.id)) ?? undefined)
    if (mfaLock.locked) await this.refuseLocked(user.email, ipAddress, mfaLock)
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
    await this.adapter.setActiveUserId(user.id, persistentSessionFor(payload.rememberMe, await loadPolicyForUser(user.id)))
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
      .select({ id: users.id, isActive: users.isActive, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1)
    if (!row || !row.isActive) {
      // Same-shape success so we don't leak account existence.
      return { devToken: null }
    }
    const token = await signToken({ kind: 'reset', userId: row.id, pwd: passwordFingerprint(row.passwordHash) } satisfies ResetPayload, RESET_TTL_MS)
    const isProd = process.env.NODE_ENV === 'production'
    const [membership] = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(and(eq(memberships.userId, row.id), eq(memberships.isActive, true)))
      .limit(1)
    const resetUrl = membership ? buildAuthLink('/reset-password', token) : null
    if (resetUrl && membership) {
      try {
        await this.emailSender({
          organizationId: membership.organizationId,
          to: input.email,
          subject: 'Reset your Bulwark password',
          text: `Use this link to reset your password. It expires in one hour.\n\n${resetUrl}`,
          html: `<p>Use this link to reset your password. It expires in one hour.</p><p><a href="${escapeEmailHtml(resetUrl)}">Reset password</a></p>`,
        })
      } catch (error) {
        console.warn('[auth] password reset email could not be sent', error instanceof Error ? error.message : 'unknown error')
      }
    } else if (isProd) {
      console.warn('[auth] password reset email not sent: BULWARK_APP_URL or active membership is missing')
    }
    return { devToken: isProd ? null : token }
  }

  async resetPassword(input: ResetPasswordInput): Promise<AuthResult> {
    // W5-3 / ADR-0037: Zod-parse at the boundary (unauthenticated entry).
    input = ResetPasswordInputSchema.parse(input)
    const payload = await verifyTokenOfKind<ResetPayload>(input.token, 'reset')
    const db = getDb()
    const [current] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.id, payload.userId), eq(users.isActive, true)))
      .limit(1)
    if (!current) throw new Error('Account not found or inactive')
    if (payload.pwd !== passwordFingerprint(current.passwordHash)) {
      throw new Error('Reset link is invalid or expired')
    }
    const newHash = await RealAuthService.hashPassword(input.newPassword)
    // Compare-and-set on the old hash: two concurrent redemptions of one link cannot both win.
    const [updated] = await db
      .update(users)
      .set({ passwordHash: newHash })
      .where(and(
        eq(users.id, payload.userId),
        eq(users.isActive, true),
        current.passwordHash === null ? isNull(users.passwordHash) : eq(users.passwordHash, current.passwordHash),
      ))
      .returning({ id: users.id })
    if (!updated) throw new Error('Reset link is invalid or expired')
    // ED-015: a reset means the old password may be known to someone else — end every session.
    await revokeUserSessions(updated.id, 'password_reset')
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
    // ED-015: keep this browser signed in, sign out every other session.
    await revokeUserSessions(row.id, 'password_change', (await this.adapter.getSessionId?.()) ?? null)
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
    const db = getDb()
    // Account-takeover guard (WP-X2 re-review P0): an invite proves only that an
    // admin typed this email, not that the person opening the link owns it. When
    // the email already has an account, the invite is accepted only by that
    // account, signed in, and never sets its password. Checked before the token
    // is consumed, so a refused attempt leaves the invite usable.
    const preview = await this.previewInvite(input.token)
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, preview.email.toLowerCase()))
      .limit(1)
    if (existing && (await this.adapter.getActiveUserId()) !== existing.id) {
      throw new Error('Invalid invite: this email already has a Bulwark account. Sign in to that account (or reset its password), then open the invite link again.')
    }

    // W2-4: opaque-token path uses pending_invites; legacy JWT fallback.
    const opaque = await tryConsumeOpaqueInvite(input.token)
    const p: InvitePayload = opaque
      ?? (await verifyTokenOfKind<InvitePayload>(input.token, 'invite'))

    let userId: string
    if (existing) {
      userId = existing.id
    } else {
      const passwordHash = await RealAuthService.hashPassword(input.password)
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
        stakeholderKind: memberships.stakeholderKind,
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
      avatarUrl: await signAssetUrl(user.avatarUrl),
      activeOrganizationId: active.organizationId,
      activeRole: active.role,
      memberships: rows.map((r) => ({
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        role: r.role,
        stakeholderKind: r.stakeholderKind,
      })),
    }
  }

  /** Record a refused (locked) attempt and throw `account_locked` with a retry hint. */
  private async refuseLocked(email: string, ipAddress: string | null, lock: LockoutState): Promise<never> {
    await getDb().insert(authAttempts).values({ email, ipAddress, success: false, reason: 'locked' })
    incCounter(COUNTERS.authFailuresTotal)
    const retryAfterSeconds = Math.max(1, Math.ceil(((lock.until ?? Date.now()) - Date.now()) / 1000))
    const err = new Error('account_locked') as Error & { retryAfterSeconds?: number }
    err.retryAfterSeconds = retryAfterSeconds
    throw err
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

  async getLockoutState(
    input: { email: string },
    limits: Pick<SecurityPolicy, 'lockoutAttempts' | 'lockoutMinutes'> = { lockoutAttempts: LOCKOUT_THRESHOLD, lockoutMinutes: LOCKOUT_DURATION_MS / 60_000 },
  ): Promise<LockoutState> {
    const threshold = limits.lockoutAttempts
    const durationMs = limits.lockoutMinutes * 60_000
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
      // Refused-while-locked attempts are not new guesses; counting them would
      // extend the lock forever for as long as someone keeps knocking.
      if (r.reason === 'mfa_required' || r.reason === 'locked') continue
      failures++
      lastFailureAt = lastFailureAt ?? r.occurredAt
    }
    if (failures >= threshold && lastFailureAt) {
      const until = lastFailureAt.getTime() + durationMs
      if (until > Date.now()) {
        return { locked: true, until, attemptsRemaining: 0 }
      }
    }
    return {
      locked: false,
      until: null,
      attemptsRemaining: Math.max(0, threshold - failures),
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
