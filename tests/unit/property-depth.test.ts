/**
 * tests/unit/property-depth.test.ts — W2-1 / EH-E (ADR-0018) acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - Wires the four mocks (property, building, contact, photo) the
 *     same way the factory does — through `attachDepthSources()` — so
 *     this test exercises the real dependency-injection plumbing, not
 *     a hand-rolled shortcut.
 *   - Asserts the nested shape (buildings → sections, contacts list,
 *     primaryPhotoUrl) that `getWithDepth()` is contractually required
 *     to return.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockPropertyService } from '~~/shared/mocks/property.mock'
import { MockBuildingService, __resetBuildingMock } from '~~/shared/mocks/building.mock'
import { MockContactService, __resetContactMock } from '~~/shared/mocks/contact.mock'
import { MockPropertyPhotoService, __resetPropertyPhotoMock } from '~~/shared/mocks/property-photo.mock'
import type { TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN, FIXTURE_PROPERTIES } from '~~/shared/mocks/fixtures'

const adminCtxResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

function wire() {
  const property = new MockPropertyService(adminCtxResolver)
  const building = new MockBuildingService(adminCtxResolver)
  const contact = new MockContactService(adminCtxResolver)
  const photo = new MockPropertyPhotoService(adminCtxResolver)
  property.attachDepthSources({ building, contact, photo })
  return { property, building, contact, photo }
}

const SEED_PROPERTY = FIXTURE_PROPERTIES[0]!

describe('getWithDepth (W2-1 / EH-E)', () => {
  beforeEach(() => {
    __resetBuildingMock()
    __resetContactMock()
    __resetPropertyPhotoMock()
  })

  it('returns null for an unknown property', async () => {
    const { property } = wire()
    const result = await property.getWithDepth('does-not-exist', FIXTURE_ORG_ID)
    expect(result).toBeNull()
  })

  it('returns the property with nested buildings (+sections), contacts, and primaryPhotoUrl', async () => {
    const { property, building, contact, photo } = wire()

    const b1 = await building.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: SEED_PROPERTY.id,
      name: 'Main house',
      kind: 'house',
      yearBuilt: 1998,
      squareFeet: 2400,
      stories: 2,
      notes: null,
    })
    const b2 = await building.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: SEED_PROPERTY.id,
      name: 'Detached garage',
      kind: 'garage',
      yearBuilt: 2005,
      squareFeet: 600,
      stories: 1,
      notes: null,
    })
    await building.createSection({
      organizationId: FIXTURE_ORG_ID,
      buildingId: b1.id,
      label: 'North roof',
      kind: 'roof',
      notes: null,
    })
    await building.createSection({
      organizationId: FIXTURE_ORG_ID,
      buildingId: b1.id,
      label: 'South roof',
      kind: 'roof',
      notes: null,
    })

    await contact.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: SEED_PROPERTY.id,
      clientId: null,
      firstName: 'Owner',
      lastName: 'Person',
      kind: 'owner',
      email: null,
      phone: null,
      isPrimary: true,
      notes: null,
    })

    await photo.create({
      organizationId: FIXTURE_ORG_ID,
      propertyId: SEED_PROPERTY.id,
      buildingId: null,
      sectionId: null,
      url: 'data:image/png;base64,xxx',
      thumbnailUrl: null,
      caption: null,
      takenAt: null,
    })

    const depth = await property.getWithDepth(SEED_PROPERTY.id, FIXTURE_ORG_ID)
    expect(depth).not.toBeNull()
    expect(depth!.property.id).toBe(SEED_PROPERTY.id)
    expect(depth!.buildings.length).toBe(2)
    const main = depth!.buildings.find((b) => b.id === b1.id)!
    const garage = depth!.buildings.find((b) => b.id === b2.id)!
    expect(main.sections.length).toBe(2)
    expect(garage.sections.length).toBe(0)
    expect(depth!.contacts.length).toBe(1)
    expect(depth!.contacts[0]!.isPrimary).toBe(true)
    expect(depth!.primaryPhotoUrl).toBe('data:image/png;base64,xxx')
  })
})
