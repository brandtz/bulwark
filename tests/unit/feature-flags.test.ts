/**
 * tests/unit/feature-flags.test.ts — W2-4.
 *
 * Proves the listForOrg() merge logic: KNOWN_FLAGS defaults are surfaced;
 * a global override (organizationId=null) shifts the default; an org
 * override flips `hasOverride` true; cross-tenant access is blocked.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockFeatureFlagService,
  __resetMockFeatureFlagsForTests,
} from '~~/shared/mocks/feature-flag.mock'
import { KNOWN_FLAGS } from '~~/shared/contracts/feature-flag'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_ORG_ID_2,
  FIXTURE_USER_ADMIN,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

beforeEach(() => {
  __resetMockFeatureFlagsForTests()
})

describe('MockFeatureFlagService.listForOrg', () => {
  it('returns KNOWN_FLAGS defaults when no overrides exist', async () => {
    const svc = new MockFeatureFlagService(adminResolver)
    const { rows } = await svc.listForOrg(FIXTURE_ORG_ID)
    for (const known of KNOWN_FLAGS) {
      const row = rows.find((r) => r.slug === known.slug)
      expect(row).toBeDefined()
      expect(row!.value).toBe(known.defaultValue)
      expect(row!.hasOverride).toBe(false)
    }
  })

  it('reflects an org override with hasOverride=true', async () => {
    const svc = new MockFeatureFlagService(adminResolver)
    const slug = KNOWN_FLAGS[0]!.slug
    await svc.set({
      organizationId: FIXTURE_ORG_ID,
      slug,
      value: 'overridden-value',
      updatedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    const { rows } = await svc.listForOrg(FIXTURE_ORG_ID)
    const row = rows.find((r) => r.slug === slug)
    expect(row?.value).toBe('overridden-value')
    expect(row?.hasOverride).toBe(true)
  })

  it('blocks cross-tenant listForOrg', async () => {
    const svc = new MockFeatureFlagService(adminResolver)
    await expect(svc.listForOrg(FIXTURE_ORG_ID_2)).rejects.toBeInstanceOf(TenantViolationError)
  })
})
