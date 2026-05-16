/**
 * tests/unit/homeowner-portal.test.ts — W3-4 / EH-O (ADR-0032).
 *
 * Verifies the MockHomeownerService: invite creates a membership +
 * invite token; listForUser returns memberships scoped to the user;
 * listForProperty returns memberships scoped to the property; remove
 * soft-deletes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockHomeownerService, __resetHomeownerMock } from '~~/shared/mocks/homeowner.mock'
import type { TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_USER_ADMIN,
  FIXTURE_PROPERTIES,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

const PROPERTY = FIXTURE_PROPERTIES[0]!

describe('Homeowner portal — invite + scoping (W3-4 / EH-O)', () => {
  let svc: MockHomeownerService

  beforeEach(() => {
    __resetHomeownerMock()
    svc = new MockHomeownerService(adminResolver)
  })

  it('invite stages a membership returned by listForProperty', async () => {
    const r = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      email: 'owner@example.test',
      fullName: 'Home Owner',
      kind: 'owner',
    })
    expect(r.inviteUrl).toContain('/accept-invite?token=')
    const list = await svc.listForProperty(PROPERTY.id, FIXTURE_ORG_ID)
    expect(list.some((m) => m.email === 'owner@example.test')).toBe(true)
  })

  it('listForUser returns only that user\'s memberships', async () => {
    const a = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      email: 'a@example.test',
      fullName: 'A',
      kind: 'owner',
    })
    await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      email: 'b@example.test',
      fullName: 'B',
      kind: 'spouse',
    })
    const propList = await svc.listForProperty(PROPERTY.id, FIXTURE_ORG_ID)
    const aMembership = propList.find((m) => m.email === 'a@example.test')!
    const userList = await svc.listForUser(aMembership.userId, FIXTURE_ORG_ID)
    expect(userList.every((m) => m.userId === aMembership.userId)).toBe(true)
    expect(userList.length).toBeGreaterThan(0)
    // membership id from invite call corresponds to one of them
    expect(propList.some((m) => m.id === a.membershipId)).toBe(true)
  })

  it('remove soft-deletes the membership', async () => {
    const r = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      propertyId: PROPERTY.id,
      email: 'gone@example.test',
      fullName: 'Gone',
      kind: 'owner',
    })
    await svc.remove(r.membershipId, FIXTURE_ORG_ID)
    const list = await svc.listForProperty(PROPERTY.id, FIXTURE_ORG_ID)
    expect(list.some((m) => m.id === r.membershipId)).toBe(false)
  })
})
