/**
 * shared/contracts/search.ts — global cross-entity search contract
 * (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - **One service for the topbar Cmd-K palette**. The palette
 *     queries `search.search({ query })` and renders the union of
 *     matches across all entity types in a single panel. Per-entity
 *     filtering happens client-side via the `types` filter on the
 *     input.
 *   - **Tenant-firewalled**. Every call resolves the active org via
 *     the standard `TenantResolver` and rejects with the firewall
 *     error if mismatched. The contract therefore does NOT take an
 *     `organizationId` for callers using the real service through
 *     the RPC dispatcher (the dispatcher fills it from the session);
 *     for direct callers / mocks, `organizationId` is required.
 *   - **Score is a number in [0,1]** with no committed semantics
 *     beyond "higher is better." v1 derives it from the ratio of
 *     query length to title length when a substring matches (longer
 *     matched proportion → higher score). See `score()` in the
 *     mock for the canonical formula.
 *   - **`index()` is a no-op hook**. Today Postgres ILIKE scans live
 *     tables directly, so there is no separate index to maintain.
 *     The method exists in the contract so a future Phase-2 backend
 *     (tsvector + GIN, or MeiliSearch) can reuse the call site we
 *     wire from create/update hooks.
 *
 * # Decision cast down
 *   - Rejected: a `cursor` / `offset` pagination shape. Cmd-K is a
 *     "top hits, type more to refine" UX; rolling pagination would
 *     reward typing a query just to scroll. Hard cap at 50 results
 *     globally with `hasMore=true` when truncated.
 *   - Rejected: returning the full row alongside the hit. The
 *     palette only needs `title/subtitle/url`; consumers that want
 *     the full row click through to the entity page.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Entity types we know how to search.
// ----------------------------------------------------------------------------
export const SearchEntityTypeSchema = z.enum([
  'property',
  'client',
  'quote',
  'work-order',
  'invoice',
  'subcontractor',
  'inspection',
  'contact',
  'building',
])
export type SearchEntityType = z.infer<typeof SearchEntityTypeSchema>

// ----------------------------------------------------------------------------
// Result row.
// ----------------------------------------------------------------------------
export const SearchResultSchema = z.object({
  entityType: SearchEntityTypeSchema,
  id: UuidSchema,
  title: z.string(),
  subtitle: z.string(),
  url: z.string(),
  /** Stable score in [0, 1]. Higher is better. */
  score: z.number().min(0).max(1),
  organizationId: UuidSchema,
})
export type SearchResult = z.infer<typeof SearchResultSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const SearchInputSchema = z.object({
  organizationId: UuidSchema,
  query: z.string().min(1).max(200),
  types: z.array(SearchEntityTypeSchema).optional(),
  /** Global cap. Defaults to 20. Hard max 50. */
  limit: z.number().int().positive().max(50).default(20),
})
export type SearchInput = z.infer<typeof SearchInputSchema>

export const SearchOutputSchema = z.object({
  results: z.array(SearchResultSchema),
  hasMore: z.boolean(),
})
export type SearchOutput = z.infer<typeof SearchOutputSchema>

export const SearchIndexInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: SearchEntityTypeSchema,
  id: UuidSchema,
})
export type SearchIndexInput = z.infer<typeof SearchIndexInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface ISearchService {
  search(input: SearchInput): Promise<SearchOutput>
  /** No-op in v1; documented promotion hook for tsvector + GIN. */
  index(input: SearchIndexInput): Promise<void>
}

// ----------------------------------------------------------------------------
// Pure scoring helper. Exported so unit tests + UI badges can use the
// same formula the services use.
//
// **Formula**: case-insensitive substring match against `title` first
// (the primary searchable column), then `subtitle` as a tiebreaker.
//   - If `title` does not contain the query at all → returns 0.
//   - Else base = clamp(queryLen / titleLen, 0.05, 1).
//   - +0.10 if title starts with the query (prefix bonus).
//   - +0.05 if subtitle also contains the query.
//   - Score is clamped to [0, 1].
//
// The result is stable for a given (query, title, subtitle) tuple.
// ----------------------------------------------------------------------------
export function scoreSearchHit(query: string, title: string, subtitle = ''): number {
  if (!query || !title) return 0
  const q = query.toLowerCase()
  const t = title.toLowerCase()
  const s = subtitle.toLowerCase()
  if (!t.includes(q)) {
    // Subtitle-only hits get a much smaller score.
    if (s.includes(q)) {
      const base = Math.max(0.05, Math.min(1, q.length / Math.max(s.length, 1))) * 0.4
      return Math.min(1, base)
    }
    return 0
  }
  let score = Math.max(0.05, Math.min(1, q.length / Math.max(t.length, 1)))
  if (t.startsWith(q)) score += 0.1
  if (s.includes(q)) score += 0.05
  return Math.min(1, score)
}
