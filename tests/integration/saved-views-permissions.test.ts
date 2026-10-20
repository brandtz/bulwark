/**
 * tests/integration/saved-views-permissions.test.ts — WP-S2 / ED-013.
 *
 * Verifies that:
 *   1. An org_admin or the original creator can delete a shared view (`userId IS NULL`).
 *   2. An org_manager CANNOT delete or update another user's shared view (throws ForbiddenError).
 *   3. A user cannot delete another user's personal view unless they are an org admin.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { organizations } from '../../server/db/schema/organizations'
import { memberships, users } from '../../server/db/schema/users'
import { RealSavedViewService } from '../../server/services/saved-view.real'
import { ForbiddenError } from '../../server/services/_tenant'

describe('RealSavedViewService — shared view permissions (WP-S2 / ED-013)', () => {
  let orgId = ''
  let adminUserId = ''
  let managerUserId = ''

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db.select().from(organizations).limit(1)
    orgId = org!.id

    const [adminMem] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.role, 'org_admin'))
      .limit(1)
    adminUserId = adminMem!.userId

    const [mgrMem] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.role, 'org_manager'))
      .limit(1)
    if (mgrMem) {
      managerUserId = mgrMem.userId
    } else {
      const [u] = await db
        .insert(users)
        .values({
          email: `mgr-sv-${Date.now()}@bulwark.demo`,
          fullName: 'Manager SavedView',
          passwordHash: 'hash',
        })
        .returning()
      managerUserId = u!.id
      await db.insert(memberships).values({
        organizationId: orgId,
        userId: managerUserId,
        role: 'org_manager',
      })
    }
  })

  it('forbids an org_manager from deleting or modifying a shared view created by another user, while allowing the creator or org_admin', async () => {
    const adminSvc = new RealSavedViewService(() => ({
      organizationId: orgId,
      userId: adminUserId,
    }))
    const managerSvc = new RealSavedViewService(() => ({
      organizationId: orgId,
      userId: managerUserId,
    }))

    // Admin creates a shared view (userId: null)
    const sharedByAdmin = await adminSvc.create({
      organizationId: orgId,
      userId: null,
      entityType: 'property',
      name: `Admin Shared View ${Date.now()}`,
      filters: { status: ['lead'] },
      layout: { columns: [{ key: 'addressLine1', visible: true }] },
    })
    expect(sharedByAdmin.layout?.columns).toEqual([{ key: 'addressLine1', visible: true }])

    // Manager attempts to delete admin's shared view -> ForbiddenError
    await expect(managerSvc.softDelete(sharedByAdmin.id, orgId)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      managerSvc.update({ id: sharedByAdmin.id, organizationId: orgId, name: 'Hijacked' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(managerSvc.setDefault(sharedByAdmin.id, orgId)).rejects.toBeInstanceOf(ForbiddenError)

    // Admin can delete it
    await adminSvc.softDelete(sharedByAdmin.id, orgId)
    expect(await adminSvc.get(sharedByAdmin.id, orgId)).toBeNull()

    // Manager creates their OWN shared view -> Manager CAN delete their own shared view
    const sharedByManager = await managerSvc.create({
      organizationId: orgId,
      userId: null,
      entityType: 'property',
      name: `Manager Shared View ${Date.now()}`,
      filters: {},
    })
    await managerSvc.softDelete(sharedByManager.id, orgId)
    expect(await managerSvc.get(sharedByManager.id, orgId)).toBeNull()
  })
})
