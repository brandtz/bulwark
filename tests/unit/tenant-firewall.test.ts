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
import { MockPersonService } from '~~/shared/mocks/person.mock'
import { MockPermitService } from '~~/shared/mocks/permit.mock'
import { MockSignatureService } from '~~/shared/mocks/signature.mock'
import { MockGeoService } from '~~/shared/mocks/geo.mock'
import { MockScanService } from '~~/shared/mocks/scan.mock'
import { MockPushService } from '~~/shared/mocks/push.mock'
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

/**
 * Every org-scoped method added since E2-S7 (WP-X2 person/permit/signature,
 * WP-X3 geo/scan/push, WP-L06 property.getMany), called as a member of org 1
 * with org 2's id. Strategy §2.3: extend this matrix for every new method.
 */
describe('Tenant firewall matrix (X2, X3, L06)', () => {
  const O2 = FIXTURE_ORG_ID_2
  const U = '00000000-0000-4000-8000-000000000001'
  const HASH = 'a'.repeat(64)
  const P = { lat: 38.5, lng: -121.5 }
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['person.list', () => new MockPersonService(adminCtxResolver).list({ organizationId: O2 })],
    ['person.get', () => new MockPersonService(adminCtxResolver).get(U, O2)],
    ['person.findByEmail', () => new MockPersonService(adminCtxResolver).findByEmail('a@b.test', O2)],
    ['person.create', () => new MockPersonService(adminCtxResolver).create({ organizationId: O2, firstName: 'X' })],
    ['person.update', () => new MockPersonService(adminCtxResolver).update({ id: U, organizationId: O2, firstName: 'X' })],
    ['person.softDelete', () => new MockPersonService(adminCtxResolver).softDelete(U, O2)],
    ['person.attachToProperty', () => new MockPersonService(adminCtxResolver).attachToProperty({ organizationId: O2, personId: U, propertyId: U })],
    ['person.listProperties', () => new MockPersonService(adminCtxResolver).listProperties(U, O2)],
    ['permit.list', () => new MockPermitService(adminCtxResolver).list({ organizationId: O2 })],
    ['permit.get', () => new MockPermitService(adminCtxResolver).get(U, O2)],
    ['permit.create', () => new MockPermitService(adminCtxResolver).create({ organizationId: O2, propertyId: U })],
    ['permit.update', () => new MockPermitService(adminCtxResolver).update({ id: U, organizationId: O2 })],
    ['permit.softDelete', () => new MockPermitService(adminCtxResolver).softDelete(U, O2)],
    ['permit.linkWorkOrder', () => new MockPermitService(adminCtxResolver).linkWorkOrder({ organizationId: O2, permitId: U, workOrderId: U })],
    ['permit.unlinkWorkOrder', () => new MockPermitService(adminCtxResolver).unlinkWorkOrder({ organizationId: O2, permitId: U, workOrderId: U })],
    ['permit.listInspections', () => new MockPermitService(adminCtxResolver).listInspections({ organizationId: O2 })],
    ['permit.scheduleInspection', () => new MockPermitService(adminCtxResolver).scheduleInspection({ organizationId: O2, permitId: U, inspectionType: 'Final', scheduledAt: '2026-10-01T00:00:00.000Z' })],
    ['permit.recordInspectionResult', () => new MockPermitService(adminCtxResolver).recordInspectionResult({ organizationId: O2, id: U, result: 'passed' })],
    ['permit.listJurisdictions', () => new MockPermitService(adminCtxResolver).listJurisdictions(O2)],
    ['permit.upsertJurisdiction', () => new MockPermitService(adminCtxResolver).upsertJurisdiction({ organizationId: O2, name: 'X County' })],
    ['permit.deleteJurisdiction', () => new MockPermitService(adminCtxResolver).deleteJurisdiction(U, O2)],
    ['signature.create', () => new MockSignatureService(adminCtxResolver).create({ organizationId: O2, entityType: 'quote', entityId: U, signerName: 'Sam Signer', method: 'typed', consent: true, documentHash: HASH })],
    ['signature.get', () => new MockSignatureService(adminCtxResolver).get(U, O2)],
    ['signature.listForEntity', () => new MockSignatureService(adminCtxResolver).listForEntity({ organizationId: O2, entityType: 'quote', entityId: U })],
    ['signature.verify', () => new MockSignatureService(adminCtxResolver).verify({ organizationId: O2, id: U, documentHash: HASH })],
    ['geo.status', () => new MockGeoService(adminCtxResolver).status(O2)],
    ['geo.autocomplete', () => new MockGeoService(adminCtxResolver).autocomplete({ organizationId: O2, query: '123 Main' })],
    ['geo.geocode', () => new MockGeoService(adminCtxResolver).geocode({ organizationId: O2, address: '123 Main St' })],
    ['geo.staticMap', () => new MockGeoService(adminCtxResolver).staticMap({ organizationId: O2, point: P })],
    ['geo.route', () => new MockGeoService(adminCtxResolver).route({ organizationId: O2, stops: [P, P] })],
    ['scan.status', () => new MockScanService(adminCtxResolver).status(O2)],
    ['scan.rescan', () => new MockScanService(adminCtxResolver).rescan({ organizationId: O2, entity: 'property_photo', id: U })],
    ['push.config', () => new MockPushService(adminCtxResolver).config(O2)],
    ['push.subscribe', () => new MockPushService(adminCtxResolver).subscribe({ organizationId: O2, endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'k', auth: 'a' } })],
    ['push.unsubscribe', () => new MockPushService(adminCtxResolver).unsubscribe({ organizationId: O2, endpoint: 'https://fcm.googleapis.com/fcm/send/x' })],
    ['push.listMine', () => new MockPushService(adminCtxResolver).listMine(O2)],
    ['push.sendTest', () => new MockPushService(adminCtxResolver).sendTest(O2)],
    ['property.getMany', () => new MockPropertyService(adminCtxResolver).getMany([U], O2)],
  ]
  for (const [name, call] of cases) {
    it(`rejects cross-tenant ${name}`, async () => {
      await expect(call()).rejects.toBeInstanceOf(TenantViolationError)
    })
  }
})
