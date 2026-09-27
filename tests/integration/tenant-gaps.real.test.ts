/**
 * WP-L07 S3 — cross-tenant gaps found by tests/integration/tenant-firewall-coverage.test.ts:
 * work-order slot start/complete and effective-permission reads took another
 * organization's id without the tenant firewall.
 */
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { RealPermissionService } from '../../server/services/permission.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('tenant gaps closed', () => {
  const mine = randomUUID()
  const theirs = randomUUID()
  const resolver = () => ({ userId: randomUUID(), organizationId: mine })

  it('refuses slot mutations on another organization before touching data', async () => {
    const svc = new RealWorkOrderService(resolver)
    const input = { workOrderId: randomUUID(), tradeSlotId: randomUUID(), organizationId: theirs }
    await expect(svc.startSlot(input)).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.completeSlot({ ...input, actualHours: 1 })).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('refuses reading another organization\'s effective permissions', async () => {
    await expect(new RealPermissionService(resolver).getEffectivePermissions('field', theirs)).rejects.toBeInstanceOf(TenantViolationError)
  })
})
