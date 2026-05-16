/**
 * tests/unit/coi-expiry.test.ts — W3-4 / EH-N (ADR-0031).
 *
 * Verifies that the COI expiry scanner correctly buckets documents
 * within the configured window and emits the right rows. The mock
 * uploadCoi + scanCoiExpiry are the units under test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockSubcontractorService, __resetSubcontractorMock } from '~~/shared/mocks/subcontractor.mock'
import { type TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_USER_ADMIN,
  FIXTURE_SUBCONTRACTORS,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

const SUB = FIXTURE_SUBCONTRACTORS[0]!

describe('COI expiry scanner — bucketing (W3-4 / EH-N)', () => {
  let svc: MockSubcontractorService

  beforeEach(() => {
    __resetSubcontractorMock()
    svc = new MockSubcontractorService(adminResolver)
  })

  it('flags COIs within the window and excludes ones outside', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const later = new Date(Date.now() + 90 * 86_400_000).toISOString()

    const expiring = await svc.uploadCoi({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      fileUrl: 'https://example.test/soon.pdf',
      fileName: 'soon.pdf',
      expiresAt: soon,
    })
    const safe = await svc.uploadCoi({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      fileUrl: 'https://example.test/later.pdf',
      fileName: 'later.pdf',
      expiresAt: later,
    })

    const flagged = await svc.scanCoiExpiry({ organizationId: FIXTURE_ORG_ID, withinDays: 30 })
    const ids = flagged.map((d) => d.id)
    expect(ids).toContain(expiring.id)
    expect(ids).not.toContain(safe.id)
  })

  it('default window is 30 days when not specified', async () => {
    const day20 = new Date(Date.now() + 20 * 86_400_000).toISOString()
    const day40 = new Date(Date.now() + 40 * 86_400_000).toISOString()
    const a = await svc.uploadCoi({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      fileUrl: 'https://example.test/a.pdf',
      fileName: 'a.pdf',
      expiresAt: day20,
    })
    const b = await svc.uploadCoi({
      organizationId: FIXTURE_ORG_ID,
      subcontractorId: SUB.id,
      fileUrl: 'https://example.test/b.pdf',
      fileName: 'b.pdf',
      expiresAt: day40,
    })
    const flagged = await svc.scanCoiExpiry({ organizationId: FIXTURE_ORG_ID })
    const ids = flagged.map((d) => d.id)
    expect(ids).toContain(a.id)
    expect(ids).not.toContain(b.id)
  })
})
