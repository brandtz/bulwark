/**
 * shared/mocks/factory.ts — MockServiceFactory.
 *
 * Returns a BulwarkServices object wired entirely to mock impls. The Nuxt
 * plugin (app/plugins/services.ts) uses this when BULWARK_BACKEND=mock.
 *
 * Decisions captured here (ADR-0004):
 *   - Singletons per process. The MockPropertyService keeps state in a
 *     module-level array; constructing two instances would duplicate state.
 *     Using `cachedServices` ensures `useService()` always returns the same
 *     instance.
 */
import type { BulwarkServices } from '../contracts/services'
import { MockAuthService, type MockAuthSessionAdapter } from './auth.mock'
import { MockPropertyService } from './property.mock'
import { MockClientService } from './client.mock'

let cachedServices: BulwarkServices | null = null

export function createMockServices(authAdapter: MockAuthSessionAdapter): BulwarkServices {
  if (!cachedServices) {
    cachedServices = {
      auth: new MockAuthService(authAdapter),
      property: new MockPropertyService(),
      client: new MockClientService(),
    }
  }
  return cachedServices
}
