/**
 * tests/unit/buildings.test.ts — W2-1 / EH-E (ADR-0018) acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - Direct mock instantiation (no factory) so each test gets a fresh
 *     in-memory store and explicit TenantResolver.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockBuildingService, __resetBuildingMock } from '~~/shared/mocks/building.mock'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN, FIXTURE_PROPERTIES } from '~~/shared/mocks/fixtures'

const adminCtxResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

const PROPERTY = FIXTURE_PROPERTIES[0]!

describe('MockBuildingService — tenant firewall (W2-1)', () => {
  beforeEach(() => __resetBuildingMock())

  it('rejects cross-tenant list', async () => {
    const svc = new MockBuildingService(adminCtxResolver)
    await expect(svc.list(FIXTURE_ORG_ID_2)).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('rejects cross-tenant create', async () => {
    const svc = new MockBuildingService(adminCtxResolver)
    await expect(
      svc.create({
        organizationId: FIXTURE_ORG_ID_2,
        propertyId: PROPERTY.id,
        name: 'X',
        kind: 'house',
        yearBuilt: null,
        squareFeet: null,
        stories: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})

describe('MockBuildingService — section reorder (W2-1)', () => {
  beforeEach(() => __resetBuildingMock())

  it('reorders sections to match orderedIds', async () => {
    const svc = new MockBuildingService(adminCtxResolver)
    const building = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      name: 'Main',
      kind: 'house',
      yearBuilt: null,
      squareFeet: null,
      stories: null,
      notes: null,
    })
    const s1 = await svc.createSection({ organizationId: FIXTURE_ORG_ID, buildingId: building.id, label: 'Roof N', kind: 'roof', notes: null })
    const s2 = await svc.createSection({ organizationId: FIXTURE_ORG_ID, buildingId: building.id, label: 'Roof S', kind: 'roof', notes: null })
    const s3 = await svc.createSection({ organizationId: FIXTURE_ORG_ID, buildingId: building.id, label: 'Wall E', kind: 'exterior_face', notes: null })

    const before = await svc.listSections(building.id, FIXTURE_ORG_ID)
    expect(before.map((s) => s.id)).toEqual([s1.id, s2.id, s3.id])
    expect(before.map((s) => s.sortOrder)).toEqual([0, 1, 2])

    await svc.reorderSections(building.id, [s3.id, s1.id, s2.id], FIXTURE_ORG_ID)
    const after = await svc.listSections(building.id, FIXTURE_ORG_ID)
    expect(after.map((s) => s.id)).toEqual([s3.id, s1.id, s2.id])
    expect(after.map((s) => s.sortOrder)).toEqual([0, 1, 2])
  })

  it('throws if orderedIds does not enumerate the active section set', async () => {
    const svc = new MockBuildingService(adminCtxResolver)
    const building = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      name: 'Main',
      kind: 'house',
      yearBuilt: null,
      squareFeet: null,
      stories: null,
      notes: null,
    })
    const s1 = await svc.createSection({ organizationId: FIXTURE_ORG_ID, buildingId: building.id, label: 'A', kind: 'roof', notes: null })
    await svc.createSection({ organizationId: FIXTURE_ORG_ID, buildingId: building.id, label: 'B', kind: 'roof', notes: null })

    // Missing s2.
    await expect(
      svc.reorderSections(building.id, [s1.id], FIXTURE_ORG_ID),
    ).rejects.toThrow()
  })
})
