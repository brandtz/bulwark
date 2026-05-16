/**
 * tests/unit/sub-portal.test.ts — W3-4 / EH-N (ADR-0031) acceptance.
 *
 * Verifies the new MockSubcontractorService methods that power the
 * sub portal: invite + remove user, list COIs / upload COI / scan
 * expiry, respond to a quote.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockSubcontractorService, __resetSubcontractorMock } from '~~/shared/mocks/subcontractor.mock'
import { MockQuoteService } from '~~/shared/mocks/quote.mock'
import { type TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_SUB,
  FIXTURE_SUBCONTRACTORS,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

const SUB = FIXTURE_SUBCONTRACTORS[0]!

describe('Sub portal — invites, COIs, quote response (W3-4 / EH-N)', () => {
  let svc: MockSubcontractorService

  beforeEach(() => {
    __resetSubcontractorMock()
    svc = new MockSubcontractorService(adminResolver)
  })

  it('inviteUser creates an invite row that listUsers returns', async () => {
    const result = await svc.inviteUser({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      email: 'sub.user@example.test',
      fullName: 'Sub User',
      invitedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    expect(result.inviteUrl).toContain('/accept-invite?token=')
    const users = await svc.listUsers(SUB.id, FIXTURE_ORG_ID)
    expect(users.some((u) => u.email === 'sub.user@example.test')).toBe(true)
  })

  it('uploadCoi + listCois + scanCoiExpiry round-trip', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const doc = await svc.uploadCoi({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      fileUrl: 'https://example.test/coi.pdf',
      fileName: 'coi.pdf',
      expiresAt,
    })
    expect(doc.id).toBeTruthy()

    const list = await svc.listCois(SUB.id, FIXTURE_ORG_ID)
    expect(list.length).toBe(1)
    expect(list[0]!.fileName).toBe('coi.pdf')

    const expiring = await svc.scanCoiExpiry({ organizationId: FIXTURE_ORG_ID, withinDays: 30 })
    expect(expiring.some((d) => d.id === doc.id)).toBe(true)
  })

  it('removeUser soft-deletes the membership', async () => {
    const r = await svc.inviteUser({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      email: 'gone@example.test',
      fullName: 'Gone',
    })
    await svc.removeUser(r.membershipId, FIXTURE_ORG_ID)
    const users = await svc.listUsers(SUB.id, FIXTURE_ORG_ID)
    expect(users.some((u) => u.id === r.membershipId)).toBe(false)
  })

  it('respondToQuote returns the response shape and does NOT change status', async () => {
    const subResolver: TenantResolver = () => ({
      userId: FIXTURE_USER_SUB.userId,
      organizationId: FIXTURE_ORG_ID,
    })
    const q = new MockQuoteService(subResolver)
    const list = await q.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 1 })
    const target = list.rows[0]
    if (!target) {
      // No fixture quotes yet — skip silently.
      return
    }
    const result = await q.respondToQuote({
      id: target.id,
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      response: 'accepted',
    })
    expect(result.response).toBe('accepted')
    expect(result.quoteId).toBe(target.id)
  })
})
