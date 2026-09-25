import { beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { MockThemePreferencesService, __resetMockThemePreferencesForTests } from '../../shared/mocks/theme-preferences.mock'
import type { TenantResolver } from '../../shared/mocks/tenant'

describe('MockThemePreferencesService', () => {
  beforeEach(() => __resetMockThemePreferencesForTests())

  it('returns system/auto defaults until the user saves preferences', async () => {
    const service = new MockThemePreferencesService(() => ({ userId: randomUUID(), organizationId: randomUUID() }))
    await expect(service.getCurrent()).resolves.toMatchObject({ theme: 'system', density: 'auto', saved: false })
  })

  it('persists partial updates per user', async () => {
    const userId = randomUUID()
    const resolver: TenantResolver = () => ({ userId, organizationId: randomUUID() })
    const first = new MockThemePreferencesService(resolver)
    await first.updateCurrent({ theme: 'dark' })
    await expect(first.getCurrent()).resolves.toMatchObject({ theme: 'dark', density: 'auto', saved: true })

    const other = new MockThemePreferencesService(() => ({ userId: randomUUID(), organizationId: randomUUID() }))
    await expect(other.getCurrent()).resolves.toMatchObject({ theme: 'system', density: 'auto', saved: false })
  })

  it('rejects unauthenticated access and empty updates', async () => {
    const service = new MockThemePreferencesService()
    await expect(service.getCurrent()).rejects.toThrow(/authentication/i)
    await expect(service.updateCurrent({})).rejects.toThrow()
  })
})