/**
 * server/services/geo.real.ts — RealGeoService (WP-X3, ED-00C).
 *
 * Tenant firewall + input validation over the resolved driver
 * (server/services/_providers/geo.ts). Every method answers even without a
 * provider: the `none` driver returns empty results and `status().enabled`
 * tells screens to fall back to free-text addresses.
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
} from '../../shared/contracts/geo'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { resolveGeoDriver, type GeoDriver } from './_providers/geo'

function parse<T>(schema: { safeParse(v: unknown): { success: true, data: T } | { success: false, error: { issues: Array<{ message: string }> } } }, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new Error(`Invalid geo input: ${r.error.issues.map((i) => i.message).join('; ')}`)
  return r.data
}

export class RealGeoService implements IGeoService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    /** Test seam: bypass config resolution. */
    private readonly driverFor: (organizationId: string) => Promise<GeoDriver> = resolveGeoDriver,
  ) {}

  async status(organizationId: string): Promise<GeoStatus> {
    assertSameTenant(this.tenantResolver, organizationId)
    const d = await this.driverFor(organizationId)
    return { provider: d.name, enabled: d.name !== 'none' }
  }

  async autocomplete(input: GeoAutocompleteInput): Promise<GeoSuggestion[]> {
    const v = parse(GeoAutocompleteInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return (await this.driverFor(v.organizationId)).autocomplete(v.query, v.limit, v.near)
  }

  async geocode(input: GeoGeocodeInput): Promise<GeoPoint | null> {
    const v = parse(GeoGeocodeInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return (await this.driverFor(v.organizationId)).geocode(v.address)
  }

  async staticMap(input: GeoStaticMapInput): Promise<{ url: string | null }> {
    const v = parse(GeoStaticMapInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return { url: (await this.driverFor(v.organizationId)).staticMapUrl(v.point, v.zoom, v.width, v.height) }
  }

  async route(input: GeoRouteInput): Promise<GeoRouteResult> {
    const v = parse(GeoRouteInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return (await this.driverFor(v.organizationId)).route(v.stops)
  }
}
