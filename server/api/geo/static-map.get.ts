/**
 * server/api/geo/static-map.get.ts — same-origin static map image (WP-X3, ED-00C).
 *
 * # Decisions
 *   - **The token stays on the server.** A Mapbox static-map URL embeds the
 *     access token, and geo.staticMap is readable by every member role
 *     (portals included). The service hands out this path instead; this route
 *     builds the provider URL for the caller's ACTIVE org and streams the image.
 *   - **Session-bound.** Any signed-in member may load a map for their active
 *     org (same audience as geo.staticMap). The org comes from the session,
 *     never the query, so a caller cannot spend another tenant's token.
 *   - **Bounded input.** Same limits as GeoStaticMapInputSchema; anything else
 *     is 400. The `none` driver answers 404 (screens hide the map).
 *   - **Cacheable per user.** `private, max-age=86400`: a pin at a fixed point
 *     does not change, and a shared cache must not serve it across sessions.
 */
import { z } from 'zod'
import { createRealServices } from '../../utils/services-factory'
import { resolveGeoDriver } from '../../services/_providers/geo'
import { log } from '../../utils/logger'

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  zoom: z.coerce.number().min(0).max(20).default(15),
  w: z.coerce.number().int().min(64).max(1280).default(600),
  h: z.coerce.number().int().min(64).max(1280).default(300),
})

const UPSTREAM_TIMEOUT_MS = 8000

export default defineEventHandler(async (event) => {
  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  if (!current) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid map request' })
  const q = parsed.data

  const driver = await resolveGeoDriver(current.activeOrganizationId)
  const upstream = driver.staticMapUrl({ lat: q.lat, lng: q.lng }, q.zoom, q.w, q.h)
  if (!upstream) throw createError({ statusCode: 404, statusMessage: 'Maps are not configured' })

  let res: Response
  try {
    res = await fetch(upstream, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch (err) {
    log('warn', 'geo.static_map_failed', { provider: driver.name, message: err instanceof Error ? err.message : 'unknown' })
    throw createError({ statusCode: 502, statusMessage: 'Map provider unavailable' })
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!res.ok || !contentType.startsWith('image/')) {
    log('warn', 'geo.static_map_failed', { provider: driver.name, status: res.status })
    throw createError({ statusCode: 502, statusMessage: 'Map provider unavailable' })
  }
  setResponseHeader(event, 'content-type', contentType)
  setResponseHeader(event, 'cache-control', 'private, max-age=86400')
  return Buffer.from(await res.arrayBuffer())
})
