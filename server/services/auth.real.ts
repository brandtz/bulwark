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
import { and, eq } from 'drizzle-orm'
import type {
  IAuthService,
  AuthResult,
  LoginInput,
  SessionUser,
  RequestPasswordResetInput,
  RequestPasswordResetResult,
  ResetPasswordInput,
  AcceptInviteInput,
  InvitePreview,
} from '../../shared/contracts/auth'
import { getDb } from '../db/client'
import { users, memberships } from '../db/schema/users'
import { organizations } from '../db/schema/organizations'

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
  async login(input: LoginInput): Promise<AuthResult> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1)

    // Constant-ish-time: always run a bcrypt compare so timing doesn't
    // distinguish "no such user" from "wrong password".
    const hash = row?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000'
    const ok = await bcrypt.compare(input.password, hash)

    if (!row || !row.isActive || !row.passwordHash || !ok) {
      throw new Error('Invalid email or password')
    }

    await this.adapter.setActiveUserId(row.id)
    await this.adapter.setActiveOrgOverride(null)

    const session = await this.buildSessionUser(row.id)
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

  // --- invitations --------------------------------------------------------
  async previewInvite(token: string): Promise<InvitePreview> {
    const p = await verifyTokenOfKind<InvitePayload>(token, 'invite')
    return { email: p.email, organizationName: p.organizationName, role: p.role }
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthResult> {
    const p = await verifyTokenOfKind<InvitePayload>(input.token, 'invite')
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
