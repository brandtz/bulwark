/**
 * shared/mocks/search.mock.ts — MockSearchService (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - Reads from the same module-level row stores the domain mocks
 *     use, via a small "mock store registry". The registry is
 *     populated by the mock factory at construction (per-call
 *     injection avoids a cyclic import).
 *   - Tenant-firewalled: every search resolves the active org and
 *     filters by it. Cross-tenant search would be a leak.
 *   - Scoring uses `scoreSearchHit()` from the contract — same
 *     formula the real backend documents.
 *   - `index()` is a no-op; documented hook for a Phase-2 tsvector
 *     promotion.
 */
import { scoreSearchHit } from '../contracts/search'
import type {
  ISearchService,
  SearchEntityType,
  SearchIndexInput,
  SearchInput,
  SearchOutput,
  SearchResult,
} from '../contracts/search'
import { assertSameTenant, type TenantResolver } from './tenant'

/**
 * One adapter per entity type. Each returns the in-memory rows for
 * the given orgId, then maps them into the search-result shape.
 * Wiring lives in the factory so this module avoids the cyclic
 * import on every domain mock.
 */
export interface SearchAdapter {
  entityType: SearchEntityType
  listForOrg(orgId: string): Promise<
    Array<{
      id: string
      organizationId: string
      title: string
      subtitle: string
      url: string
    }>
  >
}

export class MockSearchService implements ISearchService {
  private adapters: SearchAdapter[] = []

  constructor(private readonly resolver?: TenantResolver) {}

  /**
   * Register adapters at factory time. Idempotent: calling with the
   * same `entityType` replaces the prior adapter (handy for tests).
   */
  registerAdapters(adapters: SearchAdapter[]): void {
    for (const a of adapters) {
      const idx = this.adapters.findIndex((x) => x.entityType === a.entityType)
      if (idx >= 0) this.adapters[idx] = a
      else this.adapters.push(a)
    }
  }

  async search(input: SearchInput): Promise<SearchOutput> {
    assertSameTenant(this.resolver, input.organizationId)
    const limit = input.limit ?? 20
    const allowedTypes = input.types && input.types.length > 0 ? new Set(input.types) : null
    const hits: SearchResult[] = []
    for (const adapter of this.adapters) {
      if (allowedTypes && !allowedTypes.has(adapter.entityType)) continue
      const rows = await adapter.listForOrg(input.organizationId)
      const perType: SearchResult[] = []
      for (const r of rows) {
        if (r.organizationId !== input.organizationId) continue
        const score = scoreSearchHit(input.query, r.title, r.subtitle)
        if (score <= 0) continue
        perType.push({
          entityType: adapter.entityType,
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          url: r.url,
          score,
          organizationId: r.organizationId,
        })
      }
      perType.sort((a, b) => b.score - a.score)
      hits.push(...perType.slice(0, 20))
    }
    hits.sort((a, b) => b.score - a.score)
    const truncated = hits.length > limit
    return { results: hits.slice(0, limit), hasMore: truncated }
  }

  async index(_input: SearchIndexInput): Promise<void> {
    // No-op in v1. Postgres ILIKE scans live tables.
  }
}
