/**
 * tests/unit/contacts.test.ts — W2-1 / EH-E (ADR-0018) acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - Asserts the single-primary invariant per property: when a second
 *     contact is promoted via setPrimary(), the first is automatically
 *     demoted (no concurrent primaries allowed).
 *   - Also covers the create-with-isPrimary path because that's a
 *     separate code branch in the mock.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockContactService, __resetContactMock } from '~~/shared/mocks/contact.mock'
import { type TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN, FIXTURE_PROPERTIES } from '~~/shared/mocks/fixtures'

const adminCtxResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

const PROPERTY = FIXTURE_PROPERTIES[0]!

function baseInput(overrides: Partial<Parameters<MockContactService['create']>[0]> = {}) {
  return {
    organizationId: FIXTURE_ORG_ID,
    propertyId: PROPERTY.id,
    clientId: null,
    firstName: 'Test',
    lastName: 'Contact',
    kind: 'owner',
    email: null,
    phone: null,
    isPrimary: false,
    notes: null,
    ...overrides,
  }
}

describe('MockContactService — primary contact invariant (W2-1)', () => {
  beforeEach(() => __resetContactMock())

  it('setPrimary on a second contact demotes the first', async () => {
    const svc = new MockContactService(adminCtxResolver)
    const a = await svc.create(baseInput({ firstName: 'A', isPrimary: true }))
    const b = await svc.create(baseInput({ firstName: 'B', isPrimary: false }))

    expect(a.isPrimary).toBe(true)
    expect(b.isPrimary).toBe(false)

    await svc.setPrimary(b.id, FIXTURE_ORG_ID)

    const list = await svc.listForProperty(PROPERTY.id, FIXTURE_ORG_ID)
    const aAfter = list.find((c) => c.id === a.id)!
    const bAfter = list.find((c) => c.id === b.id)!
    expect(aAfter.isPrimary).toBe(false)
    expect(bAfter.isPrimary).toBe(true)

    // Exactly one primary per property.
    expect(list.filter((c) => c.isPrimary).length).toBe(1)
  })

  it('creating a second contact with isPrimary=true demotes the first', async () => {
    const svc = new MockContactService(adminCtxResolver)
    const a = await svc.create(baseInput({ firstName: 'A', isPrimary: true }))
    const b = await svc.create(baseInput({ firstName: 'B', isPrimary: true }))

    const list = await svc.listForProperty(PROPERTY.id, FIXTURE_ORG_ID)
    expect(list.filter((c) => c.isPrimary).length).toBe(1)
    const primary = list.find((c) => c.isPrimary)!
    expect(primary.id).toBe(b.id)
    // a still exists but is no longer primary.
    expect(list.some((c) => c.id === a.id && !c.isPrimary)).toBe(true)
  })
})
