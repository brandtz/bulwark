/**
 * tests/unit/tenant-firewall.test.ts — E2-S7 acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - We construct mock services *directly* (not through the factory) so
 *     each test gets a fresh in-memory store and can pass an explicit
 *     `TenantResolver`. The factory's singleton cache is fine for app
 *     code but would leak state across these tests.
 *   - Tests assert the specific `TenantViolationError` subclass instead of
 *     just any thrown Error so a future "throw a generic Error somewhere
 *     else" regression doesn't accidentally satisfy this contract.
 *
 * # Decision cast down
 *   - Rejected: spinning up a Nuxt test environment (`@nuxt/test-utils`)
 *     to drive the firewall through `useService('property')`. Heavier and
 *     slower; the unit-level proof is enough for the epic acceptance and
 *     the Playwright suite covers the full SSR path.
 */
import { describe, it, expect } from 'vitest'
import { MockPropertyService } from '~~/shared/mocks/property.mock'
import { MockClientService } from '~~/shared/mocks/client.mock'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'

const adminCtxResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('Tenant firewall (E2-S7)', () => {
  it('rejects cross-tenant property.list', async () => {
    const svc = new MockPropertyService(adminCtxResolver)
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('rejects cross-tenant property.get', async () => {
    const svc = new MockPropertyService(adminCtxResolver)
    await expect(svc.get('any-id', FIXTURE_ORG_ID_2)).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('rejects cross-tenant client.list', async () => {
    const svc = new MockClientService(adminCtxResolver)
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('allows same-tenant requests', async () => {
    const svc = new MockPropertyService(adminCtxResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 5 })
    expect(out).toBeDefined()
    expect(out.rows.every((r) => r.organizationId === FIXTURE_ORG_ID)).toBe(true)
  })

  it('skips the firewall when no resolver is provided (unit-test escape hatch)', async () => {
    const svc = new MockPropertyService()
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 5 }),
    ).resolves.toBeDefined()
  })

  it('skips the firewall when the resolver returns null (no session)', async () => {
    const svc = new MockPropertyService(() => null)
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 5 }),
    ).resolves.toBeDefined()
  })
})
