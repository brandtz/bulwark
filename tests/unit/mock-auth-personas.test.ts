import { describe, expect, it } from 'vitest'
import { MockAuthService } from '../../shared/mocks/auth.mock'

describe('MockAuthService screen-contract personas', () => {
  it.each([
    ['morgan@bulwark.demo', 'org_manager'],
    ['vivian@bulwark.demo', 'viewer'],
    ['homer@bulwark.demo', 'homeowner'],
    ['insurer@bulwark.demo', 'stakeholder'],
  ] as const)('restores %s with the %s role', async (email, role) => {
    let activePersona: string | null = null
    const auth = new MockAuthService({
      getActivePersonaEmail: () => activePersona,
      setActivePersonaEmail: (value) => {
        activePersona = value
      },
    })

    await auth.login({ email, password: 'test', rememberMe: false })
    expect((await auth.currentUser())?.activeRole).toBe(role)
  })
})
