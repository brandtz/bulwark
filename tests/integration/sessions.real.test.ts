/**
 * tests/integration/sessions.real.test.ts — WP-X2 / ED-015: user_sessions
 * lifecycle. Listing and revoking are scoped to the caller, "sign out others"
 * keeps the current session, and a password change revokes every other one.
 * (The cookie side — a revoked session is signed out on its next request — is
 * covered by tests/e2e/sessions-revoke.spec.ts.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { users, userSessions } from '../../server/db/schema'
import {
  createSessionRecord,
  isSessionRevoked,
  RealSessionService,
  revokeSession,
} from '../../server/services/session.real'
import { InMemoryAuthSessionAdapter, RealAuthService } from '../../server/services/auth.real'
import type { TenantContext } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

class TrackedAdapter extends InMemoryAuthSessionAdapter {
  sessionId: string | null = null
  getSessionId() { return this.sessionId }
}

d('user sessions (WP-X2 / ED-015)', () => {
  const tag = randomUUID().slice(0, 8)
  const password = 'Sessions!Pass1'
  const id = { me: '', other: '' }
  const svc = (current: string | null) =>
    new RealSessionService(() => ({ userId: id.me, organizationId: randomUUID() }) as TenantContext, () => current)

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 4)
    const us = await getDb().insert(users).values([
      { email: `x2-sess-${tag}@example.test`, fullName: 'Me', passwordHash: hash, isActive: true },
      { email: `x2-sess-o-${tag}@example.test`, fullName: 'Other', passwordHash: hash, isActive: true },
    ]).returning()
    ;[id.me, id.other] = us.map((u) => u.id) as [string, string]
  })

  afterAll(async () => {
    await getDb().delete(userSessions).where(inArray(userSessions.userId, [id.me, id.other]))
  })

  it('records a session and reports revocation', async () => {
    const s = await createSessionRecord(id.me, { userAgent: 'UA', ipAddress: '198.51.100.1' })
    expect(await isSessionRevoked(s, id.me)).toBe(false)
    expect(await isSessionRevoked(s, id.other)).toBe(true) // belongs to someone else
    expect(await isSessionRevoked('not-a-uuid', id.me)).toBe(true)
    await revokeSession(s, 'user')
    expect(await isSessionRevoked(s, id.me)).toBe(true)
  })

  it('lists only the caller\'s active sessions and flags the current one', async () => {
    const a = await createSessionRecord(id.me, { userAgent: 'Laptop' })
    const b = await createSessionRecord(id.me, { userAgent: 'Phone' })
    const theirs = await createSessionRecord(id.other, { userAgent: 'Theirs' })
    const list = await svc(a).listMine()
    const ids = list.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining([a, b]))
    expect(ids).not.toContain(theirs)
    expect(list.find((s) => s.id === a)!.current).toBe(true)
    expect(list.find((s) => s.id === b)!.current).toBe(false)
  })

  it('cannot revoke another user\'s session', async () => {
    const theirs = await createSessionRecord(id.other, {})
    await expect(svc(null).revoke(theirs)).rejects.toThrow(/not found/u)
    expect(await isSessionRevoked(theirs, id.other)).toBe(false)
  })

  it('revokeOthers keeps the current session', async () => {
    const current = await createSessionRecord(id.me, { userAgent: 'Current' })
    const stale = await createSessionRecord(id.me, { userAgent: 'Stale' })
    const { revoked } = await svc(current).revokeOthers()
    expect(revoked).toBeGreaterThanOrEqual(1)
    expect(await isSessionRevoked(stale, id.me)).toBe(true)
    expect(await isSessionRevoked(current, id.me)).toBe(false)
    expect((await svc(current).listMine()).map((s) => s.id)).toEqual([current])
  })

  it('a password change revokes every other session with reason password_change', async () => {
    const current = await createSessionRecord(id.me, {})
    const elsewhere = await createSessionRecord(id.me, {})
    const adapter = new TrackedAdapter()
    adapter.setActiveUserId(id.me)
    adapter.sessionId = current
    await new RealAuthService(adapter).changePassword({ currentPassword: password, newPassword: 'Sessions!Pass2' })
    expect(await isSessionRevoked(current, id.me)).toBe(false)
    const [row] = await getDb().select().from(userSessions).where(eq(userSessions.id, elsewhere))
    expect(row!.revokedAt).not.toBeNull()
    expect(row!.revokedReason).toBe('password_change')
  })
})
