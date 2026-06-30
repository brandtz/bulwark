# ADR-0033 — Global cross-entity search + saved list views

Status: Accepted (W3-5 / EH-P)
Date: 2026-05-15

## Context

Phase 1 ships nine "list" pages (properties, clients, quotes, work orders,
invoices, subcontractors, inspections, audit log, reports). Users routinely
hop between them looking for "the Cooper job", "invoice 1043", or "that
subcontractor in Queens". A Cmd-K palette removes the cognitive tax of
remembering which page to open. Likewise, every list page accumulates the
same five or six filter combinations per user; saved views let admins
canonicalise their filter sets without re-applying them on every visit.

## Decision

1. **Search**

   - One service interface `ISearchService.search(input): SearchOutput` that
     fans out to per-entity adapters and returns a unified, score-sorted
     list. Adapters live inside the mock (closures around the other mocks'
     `list()`) and the real impl (Drizzle `ilike` queries against the
     existing tables). No new infrastructure dependency (Algolia /
     Meilisearch / Elastic).
   - **Scoring** is a single pure function `scoreSearchHit(query, title,
     subtitle)` exported from the contract so server, mock, and tests
     share it:

     ```text
     match? -> false      → score = 0
     match? -> true       → base  = clamp(qLen / titleLen, 0.05, 1)
       + title starts with q     → +0.10
       + subtitle includes q     → +0.05
       subtitle-only hit         → base * 0.4
     final score = clamp(score, 0, 1)
     ```

     The formula favours short titles whose prefix matches, then falls off
     gracefully as the query becomes a smaller fraction of the title. It is
     deterministic, branch-light, and trivially testable.

   - **Tenant firewall**: every adapter (mock and real) calls
     `assertSameTenant(resolver, input.organizationId)` before reading.
     There is no cross-org search by design — even super-admins must switch
     active org.

   - **Per-type cap** of 20 hits to prevent any one entity type from
     drowning the results; global cap defaults to 20, max 50.

2. **Saved views**

   - One table `saved_views` with `(organizationId, userId NULL, entityType,
     name, filters jsonb, sortBy, sortDir, isDefault)`. `userId IS NULL`
     means "shared with the org"; everyone in the org sees those.
   - `setDefault()` is transactional (`withAudit({ tx, audit })`) — it
     clears `isDefault` on sibling rows in the same `(org, userId,
     entityType)` scope and sets it on the target row, audited as
     `state_change` with `metadata.kind='saved_view.set_default'`.
   - Filters are stored as opaque `jsonb`. Each list page owns its filter
     shape; the saved-view layer never inspects the contents.

## Rejected alternatives

- **Postgres `tsvector` + GIN indexes**. Would give us full-text matching,
  ranking, and stemming "for free", but blows up the migration footprint
  (per-table triggers, per-column generated `tsvector` columns) and the
  developer-onboarding tax (now everyone needs to learn `to_tsquery`).
  Slated for Phase 2 once the list pages have enough rows to feel slow.
- **A search service** (Algolia, Meilisearch, Elastic). Heavy ops surface
  for a Phase 1 feature that fits in two seconds of `ilike`.
- **Per-table list endpoints called from the palette**. Forces N round
  trips; this contract returns one ranked payload.

## Phase-2 promotion path

When `ilike` latency crosses ~150 ms at p95:

1. Add per-table generated `tsvector` columns + GIN indexes via a single
   migration.
2. Swap `RealSearchService` adapters to `to_tsquery` queries that still
   project the same `SearchResult` shape (the palette is unaffected).
3. Keep `scoreSearchHit` as the tiebreaker so cached results stay stable.

For saved views, the next step is "share with a role group" (e.g. "all
field techs"). That's an additive `audience` column; the current schema
covers it.
