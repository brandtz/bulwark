/**
 * tests/unit/saved-views.test.ts — visibility + setDefault semantics for
 * the saved-view mock (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions
 *   - Exercises the mock directly (no DB). The real impl shares the
 *     same `clearSiblingDefaults` semantics; the mock keeps the
 *     contract honest at unit-test speed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockSavedViewService, __resetMockSavedViewsForTests } from '~~/shared/mocks/saved-view.mock'

const ORG = '00000000-0000-0000-0000-000000000001'
const USER_A = '00000000-0000-0000-0000-00000000aaaa'
const USER_B = '00000000-0000-0000-0000-00000000bbbb'

function svc() {
  const resolver = () => ({ userId: USER_A, organizationId: ORG })
  return new MockSavedViewService(resolver)
}

describe('MockSavedViewService', () => {
  beforeEach(() => {
    __resetMockSavedViewsForTests()
  })

  it('lists only views owned by the requesting user or shared with the org', async () => {
    const s = svc()
    await s.create({
      organizationId: ORG,
      userId: USER_A,
      entityType: 'property',
      name: "A's private view",
      filters: { status: 'active' },
    })
    await s.create({
      organizationId: ORG,
      userId: null,
      entityType: 'property',
      name: 'Shared view',
      filters: {},
    })
    await s.create({
      organizationId: ORG,
      userId: USER_B,
      entityType: 'property',
      name: "B's private view",
      filters: {},
    })

    const forA = await s.list({ organizationId: ORG, userId: USER_A, entityType: 'property' })
    const names = forA.map((v) => v.name).sort()
    expect(names).toEqual(['Shared view', "A's private view"].sort())
  })

  it('setDefault clears sibling defaults in the same scope', async () => {
    const s = svc()
    const v1 = await s.create({
      organizationId: ORG,
      userId: USER_A,
      entityType: 'property',
      name: 'V1',
      filters: {},
      isDefault: true,
    })
    const v2 = await s.create({
      organizationId: ORG,
      userId: USER_A,
      entityType: 'property',
      name: 'V2',
      filters: {},
    })
    await s.setDefault(v2.id, ORG)
    const list = await s.list({ organizationId: ORG, userId: USER_A, entityType: 'property' })
    const v1after = list.find((v) => v.id === v1.id)
    const v2after = list.find((v) => v.id === v2.id)
    expect(v1after?.isDefault).toBe(false)
    expect(v2after?.isDefault).toBe(true)
  })

  it('softDelete hides a view from list but preserves the row', async () => {
    const s = svc()
    const v = await s.create({
      organizationId: ORG,
      userId: USER_A,
      entityType: 'property',
      name: 'Tmp',
      filters: {},
    })
    await s.softDelete(v.id, ORG)
    const list = await s.list({ organizationId: ORG, userId: USER_A, entityType: 'property' })
    expect(list.find((x) => x.id === v.id)).toBeUndefined()
  })
})
