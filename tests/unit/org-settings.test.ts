/**
 * tests/unit/org-settings.test.ts — Wave 1B / EH-H / W1-3 acceptance.
 */
import { describe, it, expect } from 'vitest'
import { MockOrgSettingsService } from '~~/shared/mocks/org-settings.mock'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import { ORG_SETTINGS_DEFAULTS } from '~~/shared/contracts/org-settings'
import { formatSequentialNumber, buildLikePatternForYear } from '~~/shared/utils/numbering'

const orgResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('MockOrgSettingsService (Wave 1B / EH-H / W1-3)', () => {
  it('get() synthesises defaults on first read', async () => {
    const svc = new MockOrgSettingsService(orgResolver)
    const s = await svc.get(FIXTURE_ORG_ID)
    expect(s.quoteNumberFormat).toBe(ORG_SETTINGS_DEFAULTS.quoteNumberFormat)
    expect(s.defaultMarkupBps).toBe(ORG_SETTINGS_DEFAULTS.defaultMarkupBps)
  })

  it('update() persists the change and returns the new row', async () => {
    const svc = new MockOrgSettingsService(orgResolver)
    const updated = await svc.update({
      organizationId: FIXTURE_ORG_ID,
      quoteNumberFormat: 'QUOTE-{year}-{seq:05}',
      defaultMarkupBps: 2000,
    })
    expect(updated.quoteNumberFormat).toBe('QUOTE-{year}-{seq:05}')
    expect(updated.defaultMarkupBps).toBe(2000)
    const re = await svc.get(FIXTURE_ORG_ID)
    expect(re.quoteNumberFormat).toBe('QUOTE-{year}-{seq:05}')
  })

  it('rejects cross-tenant get via tenant firewall', async () => {
    const svc = new MockOrgSettingsService(orgResolver)
    await expect(svc.get(FIXTURE_ORG_ID_2)).rejects.toBeInstanceOf(TenantViolationError)
  })
})

describe('formatSequentialNumber (Wave 1B / W1-3)', () => {
  it('formats default Q-{year}-{seq:04}', () => {
    expect(formatSequentialNumber({ format: 'Q-{year}-{seq:04}', year: 2026, seq: 7 }))
      .toBe('Q-2026-0007')
  })

  it('respects custom pad widths', () => {
    expect(formatSequentialNumber({ format: 'INV-{year}-{seq:6}', year: 2026, seq: 42 }))
      .toBe('INV-2026-000042')
  })

  it('handles unpadded {seq}', () => {
    expect(formatSequentialNumber({ format: 'X-{seq}', year: 2026, seq: 9 })).toBe('X-9')
  })

  it('leaves literal suffixes intact', () => {
    expect(formatSequentialNumber({ format: 'INV-{year}-{seq:04}-FY26', year: 2026, seq: 1 }))
      .toBe('INV-2026-0001-FY26')
  })

  it('buildLikePatternForYear collapses seq tokens to %', () => {
    expect(buildLikePatternForYear('Q-{year}-{seq:04}', 2026)).toBe('Q-2026-%')
    expect(buildLikePatternForYear('INV-{year}-{seq}-FY26', 2026)).toBe('INV-2026-%-FY26')
  })
})
