/**
 * shared/mocks/geo.mock.ts — MockGeoService (WP-X3).
 *
 * Mirrors the real service with no provider configured (the `none` driver):
 * geo disabled, empty suggestions, no geocode or map, routes in input order.
 * Offline demos therefore exercise the same free-text fallback production uses
 * before a Mapbox token is set. Same input validation and tenant firewall.
 */
import {
  GeoAutocompleteInputSchema,
  GeoGeocodeInputSchema,
  GeoRouteInputSchema,
  GeoStaticMapInputSchema,
  type GeoAutocompleteInput,
  type GeoGeocodeInput,
  type GeoPoint,
  type GeoRouteInput,
  type GeoRouteResult,
  type GeoStaticMapInput,
  type GeoStatus,
  type GeoSuggestion,
  type IGeoService,
} from '../contracts/geo'
import { assertSameTenant, type TenantResolver } from './tenant'

function check<T extends { organizationId: string }>(schema: { safeParse(v: unknown): { success: boolean, data?: unknown, error?: { issues: Array<{ message: string }> } } }, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new Error(`Invalid geo input: ${r.error!.issues.map((i) => i.message).join('; ')}`)
  return r.data as T
}

export class MockGeoService implements IGeoService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async status(organizationId: string): Promise<GeoStatus> {
    assertSameTenant(this.tenantResolver, organizationId)
    return { provider: 'none', enabled: false }
  }

  async autocomplete(input: GeoAutocompleteInput): Promise<GeoSuggestion[]> {
    assertSameTenant(this.tenantResolver, check(GeoAutocompleteInputSchema, input).organizationId)
    return []
  }

  async geocode(input: GeoGeocodeInput): Promise<GeoPoint | null> {
    assertSameTenant(this.tenantResolver, check(GeoGeocodeInputSchema, input).organizationId)
    return null
  }

  async staticMap(input: GeoStaticMapInput): Promise<{ url: string | null }> {
    assertSameTenant(this.tenantResolver, check(GeoStaticMapInputSchema, input).organizationId)
    return { url: null }
  }

  async route(input: GeoRouteInput): Promise<GeoRouteResult> {
    const v = check<{ organizationId: string, stops: GeoPoint[] }>(GeoRouteInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return { order: v.stops.map((_, i) => i), optimized: false, distanceMeters: null, durationSeconds: null }
  }
}
