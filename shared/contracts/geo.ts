/**
 * shared/contracts/geo.ts — address autocomplete, geocoding, static maps and
 * route ordering behind one provider seam (WP-X3, ED-00C).
 *
 * # Decisions
 *   - **Mapbox or `none`.** ED-00C picks Mapbox (Geocoding v6, Static Images,
 *     Optimization v1). With no token the `none` driver answers every call with
 *     an empty-but-valid result and `status().enabled === false`, so screens
 *     fall back to free-text addresses and hide map toggles (ED-030) instead of
 *     erroring. Same fail-closed doctrine as the other providers (ADR-0002).
 *   - **Parcel/APN is not geocoding** (ED-00C): not modelled here.
 *   - **Token resolution:** an org's active `provider_configs` row (kind `geo`,
 *     provider `mapbox`, sealed) wins; otherwise the platform
 *     `MAPBOX_ACCESS_TOKEN`; otherwise `none`.
 *   - **Route ordering is best-effort:** providers cap waypoints (Mapbox: 12);
 *     longer lists come back in input order with `optimized: false`.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type GeoPoint = z.infer<typeof GeoPointSchema>

export const GeoProviderNameSchema = z.enum(['mapbox', 'none'])
export type GeoProviderName = z.infer<typeof GeoProviderNameSchema>

export const GeoStatusSchema = z.object({
  provider: GeoProviderNameSchema,
  /** False → hide map toggles, keep addresses free-text. */
  enabled: z.boolean(),
})
export type GeoStatus = z.infer<typeof GeoStatusSchema>

export const GeoSuggestionSchema = z.object({
  /** Provider's stable id for the place. */
  id: z.string(),
  /** Full one-line address for display. */
  label: z.string(),
  addressLine1: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  point: GeoPointSchema.nullable(),
})
export type GeoSuggestion = z.infer<typeof GeoSuggestionSchema>

export const GeoAutocompleteInputSchema = z.object({
  organizationId: UuidSchema,
  query: z.string().trim().min(3).max(200),
  limit: z.number().int().min(1).max(10).default(5),
  /** Bias results toward this point (e.g. the org's service area). */
  near: GeoPointSchema.optional(),
})
export type GeoAutocompleteInput = z.input<typeof GeoAutocompleteInputSchema>

export const GeoGeocodeInputSchema = z.object({
  organizationId: UuidSchema,
  address: z.string().trim().min(3).max(300),
})
export type GeoGeocodeInput = z.input<typeof GeoGeocodeInputSchema>

export const GeoStaticMapInputSchema = z.object({
  organizationId: UuidSchema,
  point: GeoPointSchema,
  zoom: z.number().min(0).max(20).default(15),
  width: z.number().int().min(64).max(1280).default(600),
  height: z.number().int().min(64).max(1280).default(300),
})
export type GeoStaticMapInput = z.input<typeof GeoStaticMapInputSchema>

export const GeoRouteInputSchema = z.object({
  organizationId: UuidSchema,
  /** First stop is the fixed start (e.g. the yard or current location). */
  stops: z.array(GeoPointSchema).min(2).max(50),
})
export type GeoRouteInput = z.input<typeof GeoRouteInputSchema>

export const GeoRouteResultSchema = z.object({
  /** Visiting order as indexes into the input `stops`; always starts with 0. */
  order: z.array(z.number().int().nonnegative()),
  optimized: z.boolean(),
  distanceMeters: z.number().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
})
export type GeoRouteResult = z.infer<typeof GeoRouteResultSchema>

export interface IGeoService {
  status(organizationId: string): Promise<GeoStatus>
  autocomplete(input: GeoAutocompleteInput): Promise<GeoSuggestion[]>
  geocode(input: GeoGeocodeInput): Promise<GeoPoint | null>
  /** A static map image URL, or null when geo is disabled. */
  staticMap(input: GeoStaticMapInput): Promise<{ url: string | null }>
  route(input: GeoRouteInput): Promise<GeoRouteResult>
}
