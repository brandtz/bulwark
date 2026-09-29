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
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { users, memberships } from '../../server/db/schema/users'
import { pendingInvites } from '../../server/db/schema/pending_invites'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import {
  InMemoryAuthSessionAdapter,
  RealAuthService,
  mintInviteToken,
} from '../../server/services/auth.real'
import { RealUserService } from '../../server/services/user.real'

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
    orgIdA = a!.id
    orgIdB = b!.id
    const hash = await bcrypt.hash(password, 12)
    const [u] = await db.insert(users).values({ email, fullName: 'Test User', passwordHash: hash, isActive: true }).returning()
    userId = u!.id
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
    const result = await svc.login({ email, password, rememberMe: true })
    if (result.kind !== 'session') throw new Error('expected session')
    expect(result.user.email).toBe(email)
    expect(result.user.userId).toBe(userId)
    expect(result.user.memberships).toHaveLength(2)
    expect(adapter.getActiveUserId()).toBe(userId)
    expect(adapter.lastMaxAgeSeconds).toBe(30 * 24 * 60 * 60)
  })

  it('currentUser() exposes stakeholder kind on the matching membership', async () => {
    const stakeholderEmail = `e11s3-stakeholder-${stamp}@example.test`
    const db = getDb()
    const [stakeholder] = await db
      .insert(users)
      .values({ email: stakeholderEmail, fullName: 'Insurer Contact', isActive: true })
      .returning()
    await db.insert(memberships).values({
      userId: stakeholder!.id,
      organizationId: orgIdA,
      role: 'stakeholder',
      stakeholderKind: 'insurer',
      isActive: true,
    })

    try {
      const adapter = new InMemoryAuthSessionAdapter()
      adapter.setActiveUserId(stakeholder!.id)
      const session = await new RealAuthService(adapter).currentUser()
      expect(session?.memberships).toContainEqual(expect.objectContaining({
        organizationId: orgIdA,
        role: 'stakeholder',
        stakeholderKind: 'insurer',
      }))
    } finally {
      await db.delete(memberships).where(eq(memberships.userId, stakeholder!.id))
      await db.delete(users).where(eq(users.id, stakeholder!.id))
    }
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

  it('sends production reset links without returning the token to the caller', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousAppUrl = process.env.BULWARK_APP_URL
    const delivered: Array<{ to: string; text?: string }> = []
    process.env.NODE_ENV = 'production'
    process.env.BULWARK_APP_URL = 'https://bulwark.example'
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter(), async (message) => {
      delivered.push(message)
      return { id: 'test-email', stub: false, provider: 'test', status: 'sent' as const }
    })
    try {
      const result = await svc.requestPasswordReset({ email })
      expect(result.devToken).toBeNull()
      expect(delivered).toHaveLength(1)
      expect(delivered[0]?.to).toBe(email)
      expect(delivered[0]?.text).toMatch(/https:\/\/bulwark\.example\/reset-password\?token=/u)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousAppUrl === undefined) delete process.env.BULWARK_APP_URL
      else process.env.BULWARK_APP_URL = previousAppUrl
    }
  })

  it('emails an absolute invitation link and reports delivery status', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousAppUrl = process.env.BULWARK_APP_URL
    const delivered: Array<{ to: string; text?: string }> = []
    const inviteEmail = `invite-${stamp}@example.test`
    process.env.NODE_ENV = 'production'
    process.env.BULWARK_APP_URL = 'https://bulwark.example'
    const svc = new RealUserService(
      () => ({ userId, organizationId: orgIdA }),
      async (message) => {
        delivered.push(message)
        return { id: 'test-invite', stub: false, provider: 'test', status: 'sent' as const }
      },
    )
    let inviteId: string | undefined
    try {
      const result = await svc.invite({
        organizationId: orgIdA,
        email: inviteEmail,
        role: 'field',
        invitedByUserId: userId,
      })
      inviteId = result.inviteId
      expect(result.emailSent).toBe(true)
      expect(result.inviteUrl).toMatch(/^https:\/\/bulwark\.example\/accept-invite\?token=/u)
      expect(delivered[0]?.to).toBe(inviteEmail)
      expect(delivered[0]?.text).toContain(result.inviteUrl)
    } finally {
      if (inviteId) {
        const db = getDb()
        await db.delete(auditLog).where(eq(auditLog.entityId, inviteId))
        await db.delete(pendingInvites).where(eq(pendingInvites.id, inviteId))
      }
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousAppUrl === undefined) delete process.env.BULWARK_APP_URL
      else process.env.BULWARK_APP_URL = previousAppUrl
    }
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
    if (ok.kind !== 'session') throw new Error('expected session')
    expect(ok.user.userId).toBe(userId)

    // SH-01 review: the same link cannot be replayed once it has been used.
    await expect(svc.resetPassword({ token: devToken!, newPassword: 'Replayed!33' })).rejects.toThrow(/invalid or expired/i)
    await expect(svc2.login({ email, password: 'Replayed!33' })).rejects.toThrow(/invalid/i)
  })

  it('resetPassword() rejects a link issued before a later password change', { timeout: 20_000 }, async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    const first = await svc.requestPasswordReset({ email })
    const second = await svc.requestPasswordReset({ email })
    const rotated = 'Rotated!44'
    await svc.resetPassword({ token: second.devToken!, newPassword: rotated })
    await expect(svc.resetPassword({ token: first.devToken!, newPassword: 'Stale!55' })).rejects.toThrow(/invalid or expired/i)
    const ok = await new RealAuthService(new InMemoryAuthSessionAdapter()).login({ email, password: rotated })
    expect(ok.kind).toBe('session')
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

  it('an invite for an existing account cannot take it over (WP-X2 re-review P0)', async () => {
    // Earlier tests rotate this user's password; pin a known one.
    await getDb().update(users).set({ passwordHash: await bcrypt.hash(password, 4) }).where(eq(users.id, userId))
    const token = await mintInviteToken({ email, organizationId: orgIdB, organizationName: 'E11-S3 Org B', role: 'viewer' })
    const anon = new InMemoryAuthSessionAdapter()
    const attacker = new RealAuthService(anon)
    await expect(attacker.acceptInvite({ token, fullName: 'Attacker', password: 'Hijack!2345' }))
      .rejects.toThrow(/already has a Bulwark account/u)
    expect(await anon.getActiveUserId()).toBeNull()
    // The owner's password still works; the attacker's does not.
    await expect(new RealAuthService(new InMemoryAuthSessionAdapter()).login({ email, password: 'Hijack!2345' })).rejects.toThrow(/Invalid email or password/u)
    const owner = new InMemoryAuthSessionAdapter()
    const ownerSvc = new RealAuthService(owner)
    expect((await ownerSvc.login({ email, password })).kind).toBe('session')
    // Signed in as that account, the same (unconsumed) invite is accepted without touching the password.
    const accepted = await ownerSvc.acceptInvite({ token, fullName: 'Ignored', password: 'Ignored!2345' })
    expect(accepted.user.userId).toBe(userId)
    const [u] = await getDb().select().from(users).where(eq(users.id, userId))
    expect(u!.fullName).toBe('Test User')
    expect(await bcrypt.compare(password, u!.passwordHash!)).toBe(true)
    await getDb().update(memberships).set({ role: 'field' }).where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgIdB)))
  })

  it('previewInvite() rejects garbage tokens', async () => {
    const svc = new RealAuthService(new InMemoryAuthSessionAdapter())
    await expect(svc.previewInvite('not.a.real.token')).rejects.toThrow(/invalid|expired/i)
  })
})
