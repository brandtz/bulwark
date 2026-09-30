/**
 * server/services/geo.real.ts — RealGeoService (WP-X3, ED-00C).
 *
 * Tenant firewall + input validation over the resolved driver
 * (server/services/_providers/geo.ts). Every method answers even without a
 * provider: the `none` driver returns empty results and `status().enabled`
 * tells screens to fall back to free-text addresses.
 *
 * Static maps never hand the browser a provider URL: that URL carries the
 * org's (or platform's) secret access token, and staticMap is readable by every
 * member role, portals included. `staticMap` returns a same-origin path to
 * server/api/geo/static-map.get.ts, which fetches the image server-side
 * (X3 skeptic review P1-6).
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

/** Same-origin proxy path for a static map (no token). Exported for the route and tests. */
export function staticMapProxyPath(point: GeoPoint, zoom: number, width: number, height: number): string {
  const qs = new URLSearchParams({ lat: point.lat.toFixed(6), lng: point.lng.toFixed(6), zoom: String(zoom), w: String(width), h: String(height) })
  return `/api/geo/static-map?${qs}`
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
    const driver = await this.driverFor(v.organizationId)
    if (!driver.staticMapUrl(v.point, v.zoom, v.width, v.height)) return { url: null }
    return { url: staticMapProxyPath(v.point, v.zoom, v.width, v.height) }
  }

  async route(input: GeoRouteInput): Promise<GeoRouteResult> {
    const v = parse(GeoRouteInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    return (await this.driverFor(v.organizationId)).route(v.stops)
  }
}
