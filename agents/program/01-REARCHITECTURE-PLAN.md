# 01 — Re-Architecture Plan (built vs refactor vs new vs retire)

> Grounded in the CodeGraph snapshot of 2026-09-17 (103 pages, 47 components, 39 services,
> 50 tables, 159 test files, 52 received design SPECs). Rebuild the graph and re-read
> `agents/codegraph/coverage.md` before trusting numbers here.

## 1. Summary of the verdict

| Layer | Verdict | Why |
|---|---|---|
| **Tenancy, auth/session, audit, job queue, storage, Zod-contract discipline** | **Keep as-is** | Vertical-agnostic and proven (readout §2.5, §8). Nothing in the designs touches them. |
| **Service layer (39 services, real+mock parity)** | **Keep; extend** | Interfaces map cleanly onto the new screens. Additions: ~14 new services (people, permit, session, signature, announcement, geo, scan, push, deliverable, stakeholder, pricebook, schedule/team, vendor/PO, time, job-cost, ticket, pack, claim). Rename `complianceDoc`→`deliverable` with alias. |
| **Data model** | **Generalize + extend** | 6 wildfire-shaped items to fix (WP-X1); ~9 new entity groups for the received admin designs (WP-X2/X3); ~20 tables for modules (WP-H*). |
| **Design tokens / Tailwind** | **Replace** | Current `tokens.css` + `tailwind.config.ts` encode the retired style guide (blue `#1d4ed8`, `text-display`, etc.). Replaced wholesale by the Packet A system (WP-A1). |
| **UI primitives (30 in `app/components/ui`)** | **Restyle in place** | Names preserved by design; APIs extended additively (WP-A2). |
| **Composites** | **Create 44** | The screens are built from `BulwarkDataTable`, `BulwarkPageHeader`, `BulwarkFilterBar`, `BulwarkKanbanBoard`, editors, media, builders, scheduler… none exist (WP-A3/A4). |
| **Layouts (4) + nav** | **Rebuild to 6 shells** | admin, settings (new), field, sub, client, stakeholder (new). Nav gains groups for future modules behind flags (WP-A5). |
| **Pages (103)** | **Rebuild 97 · Retire 4 · Redirect 2** | Every page is rebuilt on the new composites against its SPEC (or ahead SPEC). Retire `/admin/dashboard`, `/field/dashboard`, legacy `/assessment`, `/settings/catalog` (→ price book). `/sub/dashboard`, `/sub/profile` stay redirects. |
| **Tests (159 files, 573 e2e tests)** | **Keep + migrate selectors + add screen-contract suite** | Existing specs are behavior tests worth keeping; they will need selector updates as pages are rebuilt. New `tests/e2e/screens/*` contract suite is additive. |
| **Legacy assessment path** (`shared/utils/compliance.ts`, `assessment` service, `/assessment` page) | **Retire** | Superseded by the inspection-template engine; readout §3 #2. Keep `assessment` service read-only for historical rows for one release, then drop. |
| **Demo site (`/demo`)** | **Untouched** (ADR-0011) | Out of scope. |

## 2. What was built that will NOT align with the designs (and what happens to it)

| Area | Today | Design intent | Disposition |
|---|---|---|---|
| Visual system | Blue style-guide tokens; `text-display/text-body` utilities; per-component Tailwind hex-free but token-named to the old guide | Accent-derived ramp; `data-hue` status; density/theme attrs; Barlow/Plex | Replace tokens (WP-A1); components consume new vars; `legacy-compat.css` shim for one phase then deleted (WP-A6) |
| `StatusBadge` colors by enum switch | fixed semantic per status | `data-hue` from tenant pipeline row | Restyle (WP-A2); pipeline rows gain `hue` (WP-X1) |
| Property hub tabs (`?tab=` inside one page, 10 tabs each rendering its own list markup) | bespoke tables per tab | `BulwarkDataTable` scoped list, same columns as org-wide list; 11 tabs; stat cards; open items | Rebuild (WP-B2/B3) reusing list components from AD-25/31/40/45/52 |
| Pipeline kanban (`PipelineColumn/PipelineList/PropertyCard`) | fixed 13 statuses, no drag legality, no bulk | data-driven columns, legal-transition drag, WIP, bulk bar, saved views | Absorb into `BulwarkKanbanBoard` (WP-A3) + rebuild page (WP-B2) |
| Hardcoded assessment form + `assessment-summary` on `OREGON_DEFAULT_STANDARDS` | wildfire fields | dynamic renderer (12 kinds) + evaluator rules | Retire page; rebuild on inspection engine (WP-B4, WP-X1) |
| Quote builder (single tier, typed lines) | denormalized JSONB, tiers added but UI thin | LineItemEditor + TierComparison + catalog slot + deposit/plan | Rebuild (WP-B5); `catalog_item_id` nullable now (WP-X2) |
| Work-order detail (trade slots, fixed 6 trades) | `TradeSchema` enum | trades from catalog; assignee team/user/sub; completion checklist; tabs for materials/time/cost | Widen contract (WP-X1); rebuild (WP-B6); tabs filled by WP-H* |
| Compliance doc generator/preview | certificate-shaped, wildfire copy | kind-driven deliverable with block sections | Contract rename (WP-X1); rebuild (WP-B9) |
| Dispatch board v1 (7-day grid) | read-only grid | full scheduler | Keep as print/fallback view (AD-44 in WP-H2) |
| Contacts (property-scoped copies) | duplicates per property | people + contacts join | Migrate (WP-X2), rebuild tab (WP-B3) |
| Field portal (two layouts: `default` for some routes, `field` for W3-3 routes) | inconsistent chrome | single field shell, tab strip, tablet two-pane | Consolidate (WP-A5, WP-D1) |
| Homeowner/Sub portals (shallow, "coming soon" placeholders) | placeholders | full flows (F/E packets) | Rebuild when designs land (WP-F*, WP-E1); no interim work |
| Insurer (ADR-0004, not built) | role planned as `insurance_representative` | generalized stakeholder with kinds | Build once, generically (WP-X1 role, WP-G1 UI) |
| `settings/catalog` (materials/labor v1) | thin config page | Price book module | Retire page → redirect to `/admin/pricebook` when WP-H1 lands |
| Nav `Compliance` item, `Work orders` label, `Today → /field/dashboard` | wildfire/old vocabulary | Documents, Jobs, My Day | WP-A5/A6 |
| Login copy "wildfire retrofit contractors" | | neutral tenant tagline | WP-A6 |

## 3. Route map changes (canonical after WP-A6)

| Old | New | Mode |
|---|---|---|
| `/admin/dashboard` | `/admin` | redirect |
| `/admin/compliance` | `/admin/documents` | redirect |
| `/admin/properties/:id/compliance/new` · `/:docId` | `/admin/properties/:id/documents/new` · `/:docId` | redirect |
| `/admin/properties/:id/assessment` | `/admin/properties/:id/inspection/new` | redirect |
| `/admin/properties/:id/assessment-summary` | `/admin/properties/:id/inspection/:inspectionId/summary` | redirect (needs latest inspection lookup) |
| `/field/dashboard` | `/field` | redirect |
| `/field/assessments` | `/field/inspections` | redirect |
| `/sub/dashboard`, `/sub/profile` | `/sub`, `/sub/settings` | already redirects |
| `/insurer/**` (planned) | `/portal/**` (stakeholder) | new; `/insurer` alias |
| — | `/admin/inspections` (AD-25), `/admin/properties/:id/permits` (AD-19), `/admin/work-orders/:id/change-orders/:coId` (AD-34), `/admin/crew`, `/admin/schedule/**`, `/admin/pricebook/**`, `/admin/vendors/**`, `/admin/purchase-orders/**`, `/admin/tickets/**`, `/admin/timesheets`, `/settings/security`, `/settings/stakeholders`, `/settings/tax`, `/settings/messages`, `/settings/deliveries`, `/settings/labor`, `/field/time`, `/homeowner/documents`, `/homeowner/requests/new`, `/request` (public) | new |

## 4. Data-model change list (ordered)

**WP-X1 (phase 0)** — generalization
1. `trades`: WO slots & sub trades validate against org catalog (string), not enum.
2. `status_pipelines.statuses[]` gains `hue`, `requires_reason`, `kind (open|side|terminal)`; property seed slugs `deliverable_pending/complete`; migration remaps `compliance_*`.
3. `compliance_docs` → `deliverables` (+ `kind`, `template_id`, `version`, `access_log`); `programs.compliance_doc_template_id` → `deliverable_template_id`; `deliverable_templates` (block JSON).
4. `memberships.role`: `insurance_representative` → `stakeholder`; `+ stakeholder_kind`; `stakeholder_links (org_id, user_id, scope, property_id)`.
5. Remove `OREGON_DEFAULT_STANDARDS` fallback; standards rows seeded per program.

**WP-X2 (phase 2)** — received admin designs
6. `people` + `contacts` join (dedupe by email); `contacts.is_billing`.
7. `permits`, `permit_jobs`, `jurisdictions`.
8. `user_sessions`; `user_prefs (theme, density, trusted_devices)`.
9. `signatures` (immutable; entity_type/entity_id, method typed|drawn, name, ip, ua, hash).
10. `platform_announcements`.
11. `org_settings.ui_history_days`; `saved_views.layout_json`; `quotes.hidden_tiers`; `quote_line_items.catalog_item_id` (nullable) — note quotes keep JSONB lines until WP-H1 introduces `quote_line_items` table; the JSONB gets the field now.
12. `property_photos`: `phase (before|during|after)`, `annotations_json`, `client_visible`; `property_attachments.scan_status`.

**WP-X3 (phase 2)** — providers: `provider_configs.kind += geo|scan|push`; `push_subscriptions`; asset `scan_status`.

**WP-L07** — `security_policies (mfa_mode, idle_minutes, lockout_attempts, lockout_minutes, trusted_days)`; `auth_attempts` already exists.

**WP-L03** — `message_deliveries`.

**WP-H1…H6 (phase 6)** — `catalog_items, catalog_categories, assemblies, assembly_components, cost_codes, markup_rules` · `teams, team_members, schedule_events, availability, sub_blackouts` · `vendors, purchase_orders, po_lines, work_order_materials` · `time_entries, labor_rates, overtime_rules` · `job_cost_snapshots` (materialized rollup) · `tickets, ticket_events, warranty_terms`.

Every migration ships `down()`; every new table has `organization_id` + tenant test.

## 5. Component adoption map (which pages consume which new composites)

| Composite | Adopting pages (phase 1–3) |
|---|---|
| `BulwarkPageHeader` | every detail page (AD-05/12/32/42/46/51/62) and list page |
| `BulwarkDataTable` + `BulwarkFilterBar` + `SavedViewsMenu` | AD-03/10(list)/25/31/40/45/52/60, ST-10/18, all property hub tabs |
| `BulwarkKanbanBoard` | AD-10, WR-01 |
| `BulwarkTimeline` | AD-20, AD-05 comms log, AD-32/46 status timeline, HO-05 |
| `BulwarkStatusMenu` | AD-12/13, AD-42 |
| `BulwarkLineItemEditor` + `MoneySummary` + `TierComparison` | AD-30/34/47, HO-11, PO-04 |
| `BulwarkPaymentsLedger` | AD-46, HO-21 |
| `BulwarkDocumentFrame` + `AsyncStatus` | AD-32/46/51, HO-11/21 |
| `BulwarkDropzone` + `PhotoGrid` + `Lightbox` + `Annotator` | AD-17/18, FD-13, SB-07 |
| `BulwarkSignatureBlock` | AD-21/32/50, HO-11/32 |
| `BulwarkTreeBuilder` + `RuleEditor` | AD-15, ST-08/12 |
| `BulwarkTransitionEditor` | ST-05 |
| `BulwarkScheduler` | SC-01/04, AD-40 calendar |
| `BulwarkMatrixTable` | EX-02, ST-11, SH-32 |
| `BulwarkCommandPalette` | SH-21 (SearchPalette wraps) |
| `BulwarkBottomSheet` / `SheetMenu` | every mobile overflow, AD-43/FD-16 |

## 6. Designing ahead (for the 161 pending screens)

Phases 0–2 need no pending designs. For phase 3 (AD-45…71) the architect writes **ahead
SPECs** in `agents/design/ahead/<ID>/SPEC.md` using the `99-RETURN-FORMAT-SPEC.md` §2
template, derived from the packet text (`11-packet-B-admin-core.md` §B6–B8) and the Packet A
component library. When the real SPEC arrives: diff → if layout/regions/actions differ
materially, open `WP-<x>-reconcile`; otherwise update the ahead SPEC to the received one and
re-run `pnpm screen:scaffold <ID> --force` to pick up new states.

Portals (D/E/F/G), settings (C), modules (H), documents (J) and long-term (I) **wait** for
their packets — the operator should run Claude Design in the order D → C → J → F → E → G → H → I
(see `agents/design/return/INTAKE-REPORT.md` §6). Their BE work (schema/services) can start
earlier because `Data shown` tables aren't needed for the data model we already know from the
readout; the WPs are marked `blocked` only on their SCR halves.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Restyling primitives breaks 100 pages at once | Additive props + `legacy-compat.css` shim; full e2e on each A2 component commit; delete shim only in WP-A6 |
| Two agents edit the same page/service | File-glob ownership enforced by `codegraph:check`; one WP per lane in progress |
| Tests written to pass rather than to challenge | Scaffold emits fixmes with explicit negative-assertion instructions; `screen:audit` requires negatives; skeptic review mandatory; matrix "mutation" test (WP-Q2) |
| Enum generalization leaks (some code still switches on `compliance_pending`) | `pnpm codegraph:query -- search compliance_` before and after WP-X1; lint rule banning legacy slugs after migration |
| Design drift between ahead SPEC and real SPEC | Ahead SPECs are flagged `designAhead`; reconcile step is mandatory in phase gate |
| Visual parity flakiness | Compare against design-rendered baselines with masks; 1.5% tolerance; only Chromium; fonts self-hosted |
| Scope creep via "while I'm here" refactors | WP `outOfScope` lists; skeptic flags any diff outside `files` globs |
