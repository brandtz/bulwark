/**
 * tests/integration/lockout.test.ts — WP-L07 S2 / ED-056 account lockout,
 * boundaries and the review fixes:
 *   - threshold−1 failures do not lock; the threshold does; a success resets;
 *   - the lock ends after lockoutMinutes and refused ("locked") attempts do
 *     not extend it;
 *   - pre-auth, every email gets the same platform threshold, so an org's
 *     stricter threshold cannot reveal that an account exists; that stricter
 *     threshold still refuses a correct password once reached;
 *   - the MFA step-up is refused while the account is locked.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { authAttempts, memberships, organizations, securityPolicies, users } from '../../server/db/schema'
import { InMemoryAuthSessionAdapter, RealAuthService } from '../../server/services/auth.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const PASSWORD = 'Lockout!2345'
const MIN = 60_000

d('account lockout (WP-L07 / ED-056)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const emails = { plain: `lock-plain-${stamp}@x.test`, strict: `lock-strict-${stamp}@x.test`, ghost: `lock-ghost-${stamp}@x.test` }
  let orgId: string
  let defaultOrgId: string
  const userIds: string[] = []

  beforeAll(async () => {
    const db = getDb()
    const [o] = await db.insert(organizations).values({ name: 'Lockout', slug: `lockout-${stamp}` }).returning()
    orgId = o!.id
    const [o2] = await db.insert(organizations).values({ name: 'Lockout default', slug: `lockout-d-${stamp}` }).returning()
    defaultOrgId = o2!.id
    // Stricter than the platform default of 5.
    await db.insert(securityPolicies).values({ organizationId: orgId, lockoutAttempts: 3, lockoutMinutes: 10 })
    const hash = await bcrypt.hash(PASSWORD, 4)
    for (const email of [emails.plain, emails.strict]) {
      const [u] = await db.insert(users).values({ email, fullName: 'L', passwordHash: hash, isActive: true }).returning()
      userIds.push(u!.id)
    }
    // Only the "strict" user belongs to the org with the stricter policy; the other uses defaults.
    await db.insert(memberships).values({ userId: userIds[0]!, organizationId: defaultOrgId, role: 'field' })
    await db.insert(memberships).values({ userId: userIds[1]!, organizationId: orgId, role: 'field' })
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(authAttempts).where(inArray(authAttempts.email, Object.values(emails)))
    await db.delete(memberships).where(inArray(memberships.organizationId, [orgId, defaultOrgId]))
    await db.delete(users).where(inArray(users.id, userIds))
    await db.delete(securityPolicies).where(eq(securityPolicies.organizationId, orgId))
    await db.delete(organizations).where(inArray(organizations.id, [orgId, defaultOrgId]))
  })

  const svc = () => new RealAuthService(new InMemoryAuthSessionAdapter())
  const reset = (email: string) => getDb().delete(authAttempts).where(eq(authAttempts.email, email))
  const fail = (email: string) => svc().login({ email, password: 'wrong-password' })

  it('threshold−1 failures do not lock; the threshold does; a success in between resets the count', async () => {
    const email = emails.plain
    await reset(email)
    for (let i = 0; i < 4; i++) await expect(fail(email)).rejects.toThrow(/Invalid email or password/u)
    expect((await svc().getLockoutState({ email })).attemptsRemaining).toBe(1)
    expect((await svc().login({ email, password: PASSWORD })).kind).toBe('session')
    expect((await svc().getLockoutState({ email })).attemptsRemaining).toBe(5)
    for (let i = 0; i < 5; i++) await expect(fail(email)).rejects.toThrow(/Invalid email or password/u)
    await expect(svc().login({ email, password: PASSWORD })).rejects.toThrow(/account_locked/u)
  })

  it('the lock ends after its duration, and knocking while locked does not extend it', async () => {
    const email = emails.plain
    await reset(email)
    const db = getDb()
    const at = (msAgo: number) => new Date(Date.now() - msAgo)
    // Five failures 14 minutes ago (inside the 15-minute window), lock = 30 minutes: locked.
    await db.insert(authAttempts).values(Array.from({ length: 5 }, () => ({ email, success: false, reason: 'bad_password', occurredAt: at(14 * MIN) })))
    expect((await svc().getLockoutState({ email })).locked).toBe(true)
    // Refused attempts made while locked are not new failures.
    for (let i = 0; i < 3; i++) await expect(svc().login({ email, password: PASSWORD })).rejects.toThrow(/account_locked/u)
    const state = await svc().getLockoutState({ email })
    expect(state.until).toBeLessThanOrEqual(Date.now() + 16 * MIN + 5_000)
    // With a 10-minute lock (the strict org's policy) the same failures have expired.
    expect((await svc().getLockoutState({ email }, { lockoutAttempts: 5, lockoutMinutes: 10 })).locked).toBe(false)
  })

  it('pre-auth, a known account under a stricter org policy answers exactly like an unknown email', async () => {
    await reset(emails.strict)
    await reset(emails.ghost)
    for (let i = 0; i < 3; i++) {
      await expect(fail(emails.strict)).rejects.toThrow(/^Invalid email or password$/u)
      await expect(fail(emails.ghost)).rejects.toThrow(/^Invalid email or password$/u)
    }
    // A 4th wrong guess still looks the same for both (no early "locked" for the real account).
    await expect(fail(emails.strict)).rejects.toThrow(/^Invalid email or password$/u)
    await expect(fail(emails.ghost)).rejects.toThrow(/^Invalid email or password$/u)
    // But the org's threshold still protects the account: the right password is refused.
    await expect(svc().login({ email: emails.strict, password: PASSWORD })).rejects.toThrow(/account_locked/u)
  })

  it('the MFA step-up is refused while the account is locked', async () => {
    const email = emails.plain
    await reset(email)
    for (let i = 0; i < 5; i++) await expect(fail(email)).rejects.toThrow(/Invalid email or password/u)
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? process.env.NUXT_SESSION_PASSWORD)
    const mfaToken = await new SignJWT({ kind: 'mfa', userId: userIds[0] }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(secret)
    await expect(svc().verifyMfa(mfaToken, '123456')).rejects.toThrow(/account_locked/u)
  })
})
