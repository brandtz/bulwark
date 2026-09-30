/**
 * tests/unit/geo.test.ts — WP-X3 geo drivers + service (ED-00C).
 *
 * Mapbox responses are faked; nothing leaves the process.
 */
import { describe, expect, it, vi } from 'vitest'
import { mapboxGeoDriver, noneGeoDriver } from '~~/server/services/_providers/geo'
import { RealGeoService, staticMapProxyPath } from '~~/server/services/geo.real'
import { MockGeoService } from '~~/shared/mocks/geo.mock'

const ORG = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000b2'
const resolver = () => ({ organizationId: ORG, userId: 'u', role: 'org_admin' }) as never

const FEATURE = {
  id: 'dXJuOm1ieGFkcjox',
  geometry: { coordinates: [-122.7141, 38.4404] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjox',
    name: '100 Main Street',
    full_address: '100 Main Street, Santa Rosa, California 95404, United States',
    coordinates: { latitude: 38.4404, longitude: -122.7141 },
    context: {
      address: { name: '100 Main Street' },
      place: { name: 'Santa Rosa' },
      region: { name: 'California', region_code: 'CA' },
      postcode: { name: '95404' },
      country: { name: 'United States', country_code: 'us' },
    },
  },
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('mapbox geo driver', () => {
  it('maps Geocoding v6 features to suggestions and sends the token + bias', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ features: [FEATURE] }))
    const d = mapboxGeoDriver('pk.test', fetcher)
    const [s] = await d.autocomplete('100 main', 5, { lat: 38.4, lng: -122.7 })
    expect(s).toEqual({
      id: 'dXJuOm1ieGFkcjox',
      label: '100 Main Street, Santa Rosa, California 95404, United States',
      addressLine1: '100 Main Street',
      city: 'Santa Rosa',
      state: 'CA',
      postalCode: '95404',
      country: 'US',
      point: { lat: 38.4404, lng: -122.7141 },
    })
    const url = new URL(fetcher.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/search/geocode/v6/forward')
    expect(url.searchParams.get('access_token')).toBe('pk.test')
    expect(url.searchParams.get('autocomplete')).toBe('true')
    expect(url.searchParams.get('proximity')).toBe('-122.7,38.4')
  })

  it('degrades to empty results on provider errors instead of throwing', async () => {
    const d = mapboxGeoDriver('pk.test', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }))
    await expect(d.autocomplete('100 main', 5)).resolves.toEqual([])
    await expect(d.geocode('100 Main St')).resolves.toBeNull()
    const d2 = mapboxGeoDriver('pk.test', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(d2.geocode('100 Main St')).resolves.toBeNull()
  })

  it('orders a route from Optimization v1 waypoint indexes', async () => {
    // Input stop i has waypoint_index = its position in the trip.
    const fetcher = vi.fn().mockResolvedValue(ok({
      code: 'Ok',
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      trips: [{ distance: 12000, duration: 900 }],
    }))
    const d = mapboxGeoDriver('pk.test', fetcher)
    const stops = [{ lat: 38, lng: -122 }, { lat: 38.1, lng: -122.1 }, { lat: 38.2, lng: -122.2 }]
    await expect(d.route(stops)).resolves.toEqual({ order: [0, 2, 1], optimized: true, distanceMeters: 12000, durationSeconds: 900 })
    expect(fetcher.mock.calls[0]![0]).toContain('/optimized-trips/v1/mapbox/driving/-122.000000,38.000000;')
  })

  it('keeps input order beyond the 12-waypoint cap or on a failed optimization', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ code: 'NoRoute' }))
    const d = mapboxGeoDriver('pk.test', fetcher)
    const many = Array.from({ length: 13 }, (_, i) => ({ lat: 38 + i / 100, lng: -122 }))
    await expect(d.route(many)).resolves.toMatchObject({ order: many.map((_, i) => i), optimized: false })
    expect(fetcher).not.toHaveBeenCalled()
    await expect(d.route(many.slice(0, 3))).resolves.toMatchObject({ order: [0, 1, 2], optimized: false })
  })

  it('builds a static map URL with a pin at the point', () => {
    const url = mapboxGeoDriver('pk.test').staticMapUrl({ lat: 38.44, lng: -122.71 }, 15, 600, 300)!
    expect(url).toContain('/styles/v1/mapbox/streets-v12/static/pin-s+0f766e(-122.710000,38.440000)/-122.710000,38.440000,15/600x300@2x')
    expect(url).toContain('access_token=pk.test')
  })
})

describe('geo service', () => {
  it('is disabled with empty-but-valid answers under the none driver', async () => {
    const svc = new RealGeoService(resolver, async () => noneGeoDriver)
    await expect(svc.status(ORG)).resolves.toEqual({ provider: 'none', enabled: false })
    await expect(svc.autocomplete({ organizationId: ORG, query: '100 main' })).resolves.toEqual([])
    await expect(svc.staticMap({ organizationId: ORG, point: { lat: 1, lng: 2 } })).resolves.toEqual({ url: null })
    await expect(svc.route({ organizationId: ORG, stops: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] })).resolves.toMatchObject({ order: [0, 1], optimized: false })
  })

  it('hands out a same-origin proxy path for static maps, never the provider URL or token', async () => {
    const svc = new RealGeoService(resolver, async () => mapboxGeoDriver('sk.secret-token'))
    const { url } = await svc.staticMap({ organizationId: ORG, point: { lat: 38.44, lng: -122.71 }, zoom: 14, width: 400, height: 200 })
    expect(url).toBe('/api/geo/static-map?lat=38.440000&lng=-122.710000&zoom=14&w=400&h=200')
    expect(url).not.toContain('secret-token')
    expect(url).not.toContain('mapbox')
    expect(staticMapProxyPath({ lat: 1, lng: 2 }, 15, 600, 300)).toBe('/api/geo/static-map?lat=1.000000&lng=2.000000&zoom=15&w=600&h=300')
  })

  it('validates input and enforces the tenant firewall', async () => {
    const svc = new RealGeoService(resolver, async () => noneGeoDriver)
    await expect(svc.autocomplete({ organizationId: ORG, query: 'ab' })).rejects.toThrow(/^Invalid geo input/)
    await expect(svc.route({ organizationId: ORG, stops: [{ lat: 1, lng: 2 }] })).rejects.toThrow(/^Invalid geo input/)
    await expect(svc.status(OTHER)).rejects.toThrow()
    await expect(svc.autocomplete({ organizationId: OTHER, query: '100 main' })).rejects.toThrow()
  })

  it('mock matches the real service without a provider', async () => {
    const real = new RealGeoService(resolver, async () => noneGeoDriver)
    const mock = new MockGeoService(resolver)
    const route = { organizationId: ORG, stops: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }] }
    expect(await mock.status(ORG)).toEqual(await real.status(ORG))
    expect(await mock.route(route)).toEqual(await real.route(route))
    expect(await mock.geocode({ organizationId: ORG, address: '100 Main St' })).toEqual(await real.geocode({ organizationId: ORG, address: '100 Main St' }))
  })
})
