/**
 * server/services/session.real.ts — RealSessionService + the user_sessions
 * lifecycle helpers the H3 session adapter and auth service use (WP-X2, ED-015).
 *
 * # Decisions
 *   - The cookie carries the row id (`sessionId`). A cookie without one (issued
 *     before ED-015) keeps working until it expires; it just is not listed.
 *   - Revocation is checked where the cookie is read (the H3 adapter's
 *     getActiveUserId), so every RPC, including currentUser, sees a revoked
 *     session as signed out.
 *   - Reasons: user (signed out / revoked from the list), password_change,
 *     password_reset, replaced (a new sign-in in the same browser), admin.
 */
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { getDb } from '../db/client'
import { userSessions } from '../db/schema/user_sessions'
import type { ISessionService, UserSessionInfo } from '../../shared/contracts/session'
import { resolveActorUserId, type TenantResolver } from './_tenant'

export type SessionRevokeReason = 'user' | 'password_change' | 'password_reset' | 'replaced' | 'admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export async function createSessionRecord(userId: string, meta: { userAgent?: string | null, ipAddress?: string | null }): Promise<string> {
  const [row] = await getDb().insert(userSessions).values({
    userId,
    userAgent: meta.userAgent ? meta.userAgent.slice(0, 512) : null,
    ipAddress: meta.ipAddress ?? null,
  }).returning({ id: userSessions.id })
  return row!.id
}

/** True when the session row is missing or revoked (or belongs to someone else). */
export async function isSessionRevoked(sessionId: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(sessionId)) return true
  const [row] = await getDb().select({ userId: userSessions.userId, revokedAt: userSessions.revokedAt })
    .from(userSessions).where(eq(userSessions.id, sessionId)).limit(1)
  return !row || row.userId !== userId || row.revokedAt !== null
}

export async function touchSession(sessionId: string): Promise<void> {
  if (!UUID_RE.test(sessionId)) return
  await getDb().update(userSessions).set({ lastSeenAt: new Date() })
    .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)))
}

export async function revokeSession(sessionId: string, reason: SessionRevokeReason): Promise<void> {
  if (!UUID_RE.test(sessionId)) return
  await getDb().update(userSessions).set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)))
}

/** Revoke every active session of the user, optionally keeping one. Returns the count. */
export async function revokeUserSessions(userId: string, reason: SessionRevokeReason, keepSessionId?: string | null): Promise<number> {
  const rows = await getDb().update(userSessions).set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(
      eq(userSessions.userId, userId),
      isNull(userSessions.revokedAt),
      ...(keepSessionId && UUID_RE.test(keepSessionId) ? [ne(userSessions.id, keepSessionId)] : []),
    ))
    .returning({ id: userSessions.id })
  return rows.length
}

export class RealSessionService implements ISessionService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly currentSessionId: () => Promise<string | null> | string | null = () => null,
  ) {}

  private user(): string {
    const id = resolveActorUserId(this.tenantResolver)
    if (!id) throw new Error('Authentication required')
    return id
  }

  async listMine(): Promise<UserSessionInfo[]> {
    const userId = this.user()
    const current = await this.currentSessionId()
    const rows = await getDb().select().from(userSessions)
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .orderBy(desc(userSessions.lastSeenAt))
    return rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      current: r.id === current,
    }))
  }

  async revoke(id: string): Promise<void> {
    const userId = this.user()
    if (!UUID_RE.test(id)) throw new Error('Session not found')
    const [row] = await getDb().update(userSessions).set({ revokedAt: new Date(), revokedReason: 'user' })
      .where(and(eq(userSessions.id, id), eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id })
    if (!row) throw new Error('Session not found')
  }

  async revokeOthers(): Promise<{ revoked: number }> {
    const userId = this.user()
    const current = await this.currentSessionId()
    return { revoked: await revokeUserSessions(userId, 'user', current) }
  }
}
