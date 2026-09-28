/**
 * server/services/_providers/geo.ts — geo drivers (WP-X3, ED-00C).
 *
 * `resolveGeoDriver(org)` picks Mapbox when the org has an active `geo`
 * provider config (sealed access token) or the platform sets
 * MAPBOX_ACCESS_TOKEN; otherwise the `none` driver. Mapbox failures degrade to
 * the `none` answer for that call (logged), never an error: an address field
 * must keep working as free text when the provider is down.
 *
 * Mapbox APIs: Geocoding v6 (forward, autocomplete), Static Images
 * (streets-v12), Optimization v1 (≤12 waypoints; roundtrip from the first
 * stop, so distance/duration include the return leg).
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { providerConfigs } from '../../db/schema/provider_configs'
import { unsealProviderConfig } from '../provider-config.real'
import { log } from '../../utils/logger'
import type { GeoPoint, GeoProviderName, GeoRouteResult, GeoSuggestion } from '../../../shared/contracts/geo'

export interface GeoDriver {
  name: GeoProviderName
  autocomplete(query: string, limit: number, near?: GeoPoint): Promise<GeoSuggestion[]>
  geocode(address: string): Promise<GeoPoint | null>
  staticMapUrl(point: GeoPoint, zoom: number, width: number, height: number): string | null
  route(stops: GeoPoint[]): Promise<GeoRouteResult>
}

const inputOrder = (n: number): GeoRouteResult => ({
  order: Array.from({ length: n }, (_, i) => i),
  optimized: false,
  distanceMeters: null,
  durationSeconds: null,
})

export const noneGeoDriver: GeoDriver = {
  name: 'none',
  autocomplete: async () => [],
  geocode: async () => null,
  staticMapUrl: () => null,
  route: async (stops) => inputOrder(stops.length),
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json(): Promise<unknown> }>

const MAPBOX = 'https://api.mapbox.com'
const TIMEOUT_MS = 5000
const MAX_OPTIMIZE = 12
const PIN_COLOR = '0f766e'

interface MbFeature {
  id?: string
  properties?: {
    mapbox_id?: string
    name?: string
    full_address?: string
    coordinates?: { latitude?: number, longitude?: number }
    context?: Record<string, { name?: string, region_code?: string, country_code?: string } | undefined>
  }
  geometry?: { coordinates?: [number, number] }
}

function toSuggestion(f: MbFeature): GeoSuggestion {
  const p = f.properties ?? {}
  const ctx = p.context ?? {}
  const lat = p.coordinates?.latitude ?? f.geometry?.coordinates?.[1]
  const lng = p.coordinates?.longitude ?? f.geometry?.coordinates?.[0]
  return {
    id: p.mapbox_id ?? f.id ?? '',
    label: p.full_address ?? p.name ?? '',
    addressLine1: ctx.address?.name ?? p.name ?? '',
    city: ctx.place?.name ?? ctx.locality?.name ?? '',
    state: ctx.region?.region_code ?? ctx.region?.name ?? '',
    postalCode: ctx.postcode?.name ?? '',
    country: (ctx.country?.country_code ?? '').toUpperCase(),
    point: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
  }
}

export function mapboxGeoDriver(token: string, fetcher: Fetcher = fetch as unknown as Fetcher): GeoDriver {
  const get = async (url: string): Promise<unknown | null> => {
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) {
        log('warn', 'geo.provider_error', { provider: 'mapbox', status: res.status })
        return null
      }
      return await res.json()
    } catch (err) {
      log('warn', 'geo.provider_error', { provider: 'mapbox', message: err instanceof Error ? err.message : 'unknown' })
      return null
    }
  }
  const tokenParam = `access_token=${encodeURIComponent(token)}`

  return {
    name: 'mapbox',
    async autocomplete(query, limit, near) {
      const qs = new URLSearchParams({ q: query, autocomplete: 'true', limit: String(limit), types: 'address', country: 'us' })
      if (near) qs.set('proximity', `${near.lng},${near.lat}`)
      const body = await get(`${MAPBOX}/search/geocode/v6/forward?${qs}&${tokenParam}`) as { features?: MbFeature[] } | null
      return (body?.features ?? []).map(toSuggestion).filter((s) => s.label)
    },
    async geocode(address) {
      const qs = new URLSearchParams({ q: address, limit: '1', country: 'us' })
      const body = await get(`${MAPBOX}/search/geocode/v6/forward?${qs}&${tokenParam}`) as { features?: MbFeature[] } | null
      const first = body?.features?.[0]
      return first ? toSuggestion(first).point : null
    },
    staticMapUrl(point, zoom, width, height) {
      const at = `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`
      return `${MAPBOX}/styles/v1/mapbox/streets-v12/static/pin-s+${PIN_COLOR}(${at})/${at},${zoom}/${width}x${height}@2x?${tokenParam}`
    },
    async route(stops) {
      if (stops.length > MAX_OPTIMIZE) return inputOrder(stops.length)
      const coords = stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(';')
      const body = await get(`${MAPBOX}/optimized-trips/v1/mapbox/driving/${coords}?source=first&roundtrip=true&${tokenParam}`) as {
        code?: string
        waypoints?: Array<{ waypoint_index: number }>
        trips?: Array<{ distance?: number, duration?: number }>
      } | null
      if (!body || body.code !== 'Ok' || !body.waypoints || body.waypoints.length !== stops.length) return inputOrder(stops.length)
      // waypoints[i] is input stop i; its waypoint_index is its position in the trip.
      const order = body.waypoints.map((w, i) => ({ i, at: w.waypoint_index })).sort((a, b) => a.at - b.at).map((x) => x.i)
      return {
        order,
        optimized: true,
        distanceMeters: body.trips?.[0]?.distance ?? null,
        durationSeconds: body.trips?.[0]?.duration ?? null,
      }
    },
  }
}

/** Org config → platform env → none. */
export async function resolveGeoDriver(organizationId: string): Promise<GeoDriver> {
  try {
    const [row] = await getDb()
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.organizationId, organizationId), eq(providerConfigs.kind, 'geo'), eq(providerConfigs.isActive, true)))
      .limit(1)
    if (row?.provider === 'mapbox') {
      const token = (unsealProviderConfig(row) as { accessToken?: string }).accessToken
      if (token) return mapboxGeoDriver(token)
    }
  } catch (err) {
    log('warn', 'geo.config_unavailable', { message: err instanceof Error ? err.message : 'unknown' })
  }
  const platform = process.env.MAPBOX_ACCESS_TOKEN
  return platform ? mapboxGeoDriver(platform) : noneGeoDriver
}
