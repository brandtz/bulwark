/**
 * WP-L07 S2 — organization security policy: defaults, validation, audit,
 * tenant firewall, MFA roster/status, custom lockout thresholds and the
 * ED-001 rule that an idle timeout disables "Keep me signed in".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getDb } from '../../server/db/client'
import { memberships, users } from '../../server/db/schema/users'
import { organizations } from '../../server/db/schema/organizations'
import { securityPolicies } from '../../server/db/schema/security_policies'
import { auditLog } from '../../server/db/schema/audit_log'
import { authAttempts } from '../../server/db/schema/auth_attempts'
import { userMfa } from '../../server/db/schema/user_mfa'
import { RealSecurityPolicyService } from '../../server/services/security-policy.real'
import { InMemoryAuthSessionAdapter, RealAuthService } from '../../server/services/auth.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealSecurityPolicyService + policy-driven auth', () => {
  const tag = randomUUID().slice(0, 8)
  const password = 'Policy!Pass1'
  const id = { org: '', other: '', admin: '', member: '' }
  const email = { admin: `policy-admin-${tag}@example.test`, member: `policy-member-${tag}@example.test` }

  beforeAll(async () => {
    const db = getDb()
    const [org, other] = await db.insert(organizations).values([
      { name: 'Policy Org', slug: `policy-${tag}` },
      { name: 'Policy Other', slug: `policy-other-${tag}` },
    ]).returning()
    ;[id.org, id.other] = [org!.id, other!.id]
    const hash = await bcrypt.hash(password, 4)
    const [a, m] = await db.insert(users).values([
      { email: email.admin, fullName: 'Policy Admin', passwordHash: hash, isActive: true },
      { email: email.member, fullName: 'Policy Member', passwordHash: hash, isActive: true },
    ]).returning()
    ;[id.admin, id.member] = [a!.id, m!.id]
    await db.insert(memberships).values([
      { userId: id.admin, organizationId: id.org, role: 'org_admin' },
      { userId: id.member, organizationId: id.org, role: 'field' },
    ])
    await db.insert(userMfa).values({ userId: id.admin, kind: 'totp', secretEncrypted: 'x', confirmedAt: new Date() } as typeof userMfa.$inferInsert)
  })

  afterAll(async () => {
    if (!id.org) return
    const db = getDb()
    await db.delete(authAttempts).where(inArray(authAttempts.email, [email.admin, email.member]))
    await db.delete(userMfa).where(inArray(userMfa.userId, [id.admin, id.member]))
    await db.delete(securityPolicies).where(inArray(securityPolicies.organizationId, [id.org, id.other]))
    await db.delete(auditLog).where(eq(auditLog.organizationId, id.org))
    await db.delete(memberships).where(eq(memberships.organizationId, id.org))
    await db.delete(users).where(inArray(users.id, [id.admin, id.member]))
    await db.delete(organizations).where(inArray(organizations.id, [id.org, id.other]))
  })

  const as = (userId: string) => () => ({ userId, organizationId: id.org })

  it('returns defaults until saved, then persists partial updates with an audit row', async () => {
    const svc = new RealSecurityPolicyService(as(id.admin))
    await expect(svc.get(id.org)).resolves.toMatchObject({ mfaMode: 'optional', idleMinutes: null, lockoutAttempts: 5, lockoutMinutes: 30, trustedDays: 30, saved: false })
    await svc.update({ organizationId: id.org, lockoutAttempts: 3, lockoutMinutes: 10 })
    await expect(svc.get(id.org)).resolves.toMatchObject({ lockoutAttempts: 3, lockoutMinutes: 10, mfaMode: 'optional', saved: true })
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.organizationId, id.org))
    expect(audits.some((r) => r.entityType === 'security_policy' && r.actorUserId === id.admin)).toBe(true)
  })

  it('rejects out-of-range values and other tenants', async () => {
    const svc = new RealSecurityPolicyService(as(id.admin))
    await expect(svc.update({ organizationId: id.org, idleMinutes: 1 })).rejects.toThrow()
    await expect(svc.update({ organizationId: id.org, trustedDays: 365 })).rejects.toThrow()
    await expect(svc.update({ organizationId: id.org, mfaMode: 'always' as never })).rejects.toThrow()
    await expect(svc.update({ organizationId: id.other, lockoutAttempts: 4 })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.get(id.other)).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('reports MFA enrolment in the roster and in each member\'s own status', async () => {
    const svc = new RealSecurityPolicyService(as(id.admin))
    await svc.update({ organizationId: id.org, mfaMode: 'required' })
    const roster = await svc.mfaRoster(id.org)
    expect(roster.find((r) => r.userId === id.admin)?.mfaEnabled).toBe(true)
    expect(roster.find((r) => r.userId === id.member)?.mfaEnabled).toBe(false)
    await expect(new RealSecurityPolicyService(as(id.member)).getMine()).resolves.toMatchObject({ mfaEnrollmentRequired: true, mfaEnrolled: false })
    await expect(svc.getMine()).resolves.toMatchObject({ mfaEnrollmentRequired: false, mfaEnrolled: true })
    await svc.update({ organizationId: id.org, mfaMode: 'optional' })
  })

  it('locks the account after the organization\'s own attempt threshold', async () => {
    const auth = new RealAuthService(new InMemoryAuthSessionAdapter())
    for (let i = 0; i < 3; i++) await expect(auth.login({ email: email.member, password: 'wrong' })).rejects.toThrow(/Invalid/u)
    await expect(auth.login({ email: email.member, password })).rejects.toThrow(/account_locked/u)
  })

  it('honours trusted-device lifetime and ignores Keep me signed in under an idle timeout (ED-001)', async () => {
    const svc = new RealSecurityPolicyService(as(id.admin))
    await svc.update({ organizationId: id.org, trustedDays: 7, idleMinutes: null })
    const persistent = new InMemoryAuthSessionAdapter()
    await new RealAuthService(persistent).login({ email: email.admin, password, rememberMe: true }).catch(() => undefined)
    // Admin has MFA: password login returns the step-up envelope and does not set a session yet.
    expect(persistent.lastMaxAgeSeconds).toBeUndefined()

    await getDb().delete(authAttempts).where(eq(authAttempts.email, email.member))
    const noIdle = new InMemoryAuthSessionAdapter()
    await new RealAuthService(noIdle).login({ email: email.member, password, rememberMe: true })
    expect(noIdle.lastMaxAgeSeconds).toBe(7 * 24 * 60 * 60)

    await svc.update({ organizationId: id.org, idleMinutes: 15 })
    const withIdle = new InMemoryAuthSessionAdapter()
    await new RealAuthService(withIdle).login({ email: email.member, password, rememberMe: true })
    expect(withIdle.lastMaxAgeSeconds).toBeUndefined()
  })
})
