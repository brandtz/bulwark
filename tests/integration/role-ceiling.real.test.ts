/**
 * tests/integration/role-ceiling.real.test.ts — WP-L07 review P0: an
 * org_manager (admin group in the RPC policy) must not promote themselves to
 * super_admin, grant a role above their own, or change a member who outranks
 * them. Trusted server code (no session) keeps working.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { auditLog, memberships, organizations, pendingInvites, users } from '../../server/db/schema'
import { RealUserService } from '../../server/services/user.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('role ceiling on RealUserService', () => {
  let orgId: string
  const ids: Record<'owner' | 'admin' | 'manager' | 'field', string> = { owner: '', admin: '', manager: '', field: '' }

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'Ceiling', slug: `ceiling-${stamp}` }).returning()
    orgId = o!.id
    const hash = await bcrypt.hash('x', 4)
    const roles = { owner: 'super_admin', admin: 'org_admin', manager: 'org_manager', field: 'field' } as const
    for (const k of Object.keys(roles) as Array<keyof typeof roles>) {
      const [u] = await db.insert(users).values({ email: `${k}-${stamp}@ceiling.test`, fullName: k, passwordHash: hash, isActive: true }).returning()
      ids[k] = u!.id
      await db.insert(memberships).values({ userId: u!.id, organizationId: orgId, role: roles[k] })
    }
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(pendingInvites).where(eq(pendingInvites.organizationId, orgId))
    await db.delete(memberships).where(eq(memberships.organizationId, orgId))
    await db.delete(users).where(inArray(users.id, Object.values(ids)))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const as = (userId: string) => new RealUserService(() => ({ organizationId: orgId, userId }))
  const roleOf = async (userId: string) => (await getDb().select().from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId))))[0]!.role

  it('an org_manager cannot promote themselves to super_admin or org_admin', async () => {
    await expect(as(ids.manager).setRole({ organizationId: orgId, userId: ids.manager, role: 'super_admin' })).rejects.toThrow(/cannot grant super_admin/)
    await expect(as(ids.manager).setRole({ organizationId: orgId, userId: ids.manager, role: 'org_admin' })).rejects.toThrow(/cannot grant org_admin/)
    expect(await roleOf(ids.manager)).toBe('org_manager')
  })

  it('an org_manager cannot invite above their rank nor demote an org_admin', async () => {
    await expect(as(ids.manager).invite({ organizationId: orgId, email: 'boss@ceiling.test', role: 'super_admin', invitedByUserId: ids.manager })).rejects.toThrow(/cannot grant super_admin/)
    await expect(as(ids.manager).setRole({ organizationId: orgId, userId: ids.admin, role: 'viewer' })).rejects.toThrow(/cannot change a org_admin/)
    expect(await roleOf(ids.admin)).toBe('org_admin')
    const invites = await getDb().select().from(pendingInvites).where(eq(pendingInvites.organizationId, orgId))
    expect(invites).toHaveLength(0)
  })

  it('an org_admin cannot touch the owner; the owner can grant anything; manager can manage field', async () => {
    await expect(as(ids.admin).setRole({ organizationId: orgId, userId: ids.owner, role: 'viewer' })).rejects.toThrow(/cannot change a super_admin/)
    await as(ids.manager).setRole({ organizationId: orgId, userId: ids.field, role: 'org_manager' })
    expect(await roleOf(ids.field)).toBe('org_manager')
    await as(ids.owner).setRole({ organizationId: orgId, userId: ids.field, role: 'org_admin' })
    expect(await roleOf(ids.field)).toBe('org_admin')
  })

  it('trusted server code (no session) is not subject to the ceiling', async () => {
    await new RealUserService().setRole({ organizationId: orgId, userId: ids.field, role: 'field' })
    expect(await roleOf(ids.field)).toBe('field')
  })
})
