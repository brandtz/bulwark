/**
 * tests/integration/auth.real.test.ts — RealAuthService end-to-end (E11-S3).
 *
 * # Decisions (ADR-0007 carve-out)
 *   - Auto-skips when DATABASE_URL is unset.
 *   - Each test fabricates an isolated user + org so the suite is safe to
 *     run alongside `db:seed` data and other integration suites.
 *   - We DON'T call `closeDb()` here; the audit suite owns lifecycle
 *     teardown so running both in one vitest run keeps the pool alive.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { users, memberships } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import {
  InMemoryAuthSessionAdapter,
  RealAuthService,
  mintInviteToken,
} from '../../server/services/auth.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

// Ensure a JWT secret exists for token tests.
if (!process.env.JWT_SECRET && !process.env.NUXT_SESSION_PASSWORD) {
  process.env.JWT_SECRET = 'test-only-secret-must-be-at-least-sixteen-chars'
}

d('RealAuthService (E11-S3)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgIdA: string
  let orgIdB: string
  let userId: string
  const password = 'TestPass!1'
  const email = `e11s3-${stamp}@example.test`

  beforeAll(async () => {
    const db = getDb()
    const [a] = await db.insert(organizations).values({ name: 'E11-S3 Org A', slug: `e11s3a-${stamp}` }).returning()
    const [b] = await db.insert(organizations).values({ name: 'E11-S3 Org B', slug: `e11s3b-${stamp}` }).returning()
    orgIdA = a.id
    orgIdB = b.id
    const hash = await bcrypt.hash(password, 12)
    const [u] = await db.insert(users).values({ email, fullName: 'Test User', passwordHash: hash, isActive: true }).returning()
    userId = u.id
    await db.insert(memberships).values({ userId, organizationId: orgIdA, role: 'org_admin', isActive: true })
    await db.insert(memberships).values({ userId, organizationId: orgIdB, role: 'field', isActive: true })
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(memberships).where(eq(memberships.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, orgIdA))
    await db.delete(organizations).where(eq(organizations.id, orgIdB))
  })

  it('login() succeeds with correct password and populates session', async () => {
    const adapter = new InMemoryAuthSessionAdapter()
    const svc = new RealAuthService(adapter)
    const result = await svc.login({ email, password })
    expect(result.user.email).toBe(email)
    expect(result.user.userId).toBe(userId)
    expect(result.user.memberships).toHaveLength(2)
    expect(adapter.getActiveUserId()).toBe(userId)
  })

  it('login() rejects wrong password', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    await expect(svc.login({ email, password: 'wrong' })).rejects.toThrow(/invalid/i)
  })

  it('login() rejects unknown email with same error (no user enumeration)', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    await expect(svc.login({ email: 'nope@example.test', password: 'whatever' })).rejects.toThrow(/invalid/i)
  })

  it('currentUser() returns null when no active session', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    expect(await svc.currentUser()).toBeNull()
  })

  it('switchActiveOrg() honors override + rejects non-member orgs', async () => {
    const adapter = new InMemoryAuthSessionAdapter()
    const svc = new RealAuthService(adapter)
    await svc.login({ email, password })
    const switched = await svc.switchActiveOrg(orgIdB)
    expect(switched.activeOrganizationId).toBe(orgIdB)
    expect(switched.activeRole).toBe('field')
    const fresh = await svc.currentUser()
    expect(fresh?.activeOrganizationId).toBe(orgIdB)
    await expect(svc.switchActiveOrg('00000000-0000-4000-8000-000000000000'))
      .rejects.toThrow(/not a member/i)
  })

  it('logout() clears the adapter', async () => {
    const adapter = new InMemoryAuthSessionAdapter()
    const svc = new RealAuthService(adapter)
    await svc.login({ email, password })
    await svc.logout()
    expect(adapter.getActiveUserId()).toBeNull()
    expect(await svc.currentUser()).toBeNull()
  })

  it('requestPasswordReset() returns devToken in dev for known emails', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    const r = await svc.requestPasswordReset({ email })
    expect(r.devToken).toBeTruthy()
  })

  it('requestPasswordReset() returns null devToken for unknown emails (no enumeration)', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    const r = await svc.requestPasswordReset({ email: 'nope@example.test' })
    expect(r.devToken).toBeNull()
  })

  it('resetPassword() rotates the hash and signs the user in', { timeout: 20_000 }, async () => {
    const adapter = new InMemoryAuthSessionAdapter()
    const svc = new RealAuthService(adapter)
    const { devToken } = await svc.requestPasswordReset({ email })
    expect(devToken).toBeTruthy()
    const newPassword = 'Rotated!22'
    const result = await svc.resetPassword({ token: devToken!, newPassword })
    expect(result.user.userId).toBe(userId)

    // Old password no longer works; new one does.
    const svc2 = new RealAuthService(new InMemoryAuthSessionAdapter())
    await expect(svc2.login({ email, password })).rejects.toThrow(/invalid/i)
    const ok = await svc2.login({ email, password: newPassword })
    expect(ok.user.userId).toBe(userId)
  })

  it('mintInviteToken + acceptInvite create a user + membership', async () => {
    const inviteEmail = `e11s3-invite-${stamp}@example.test`
    const token = await mintInviteToken({
      email: inviteEmail,
      organizationId: orgIdA,
      organizationName: 'E11-S3 Org A',
      role: 'field',
    })
    const adapter = new InMemoryAuthSessionAdapter()
    const svc = new RealAuthService(adapter)

    const preview = await svc.previewInvite(token)
    expect(preview.email).toBe(inviteEmail)
    expect(preview.role).toBe('field')

    const result = await svc.acceptInvite({ token, fullName: 'Invited Person', password: 'Invited!22' })
    expect(result.user.email).toBe(inviteEmail)
    expect(result.user.activeRole).toBe('field')

    // Cleanup the invitee.
    const db = getDb()
    await db.delete(memberships).where(eq(memberships.userId, result.user.userId))
    await db.delete(users).where(eq(users.id, result.user.userId))
  })

  it('previewInvite() rejects garbage tokens', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    await expect(svc.previewInvite('not.a.real.token')).rejects.toThrow(/invalid|expired/i)
  })
})
