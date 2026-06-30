# L13 — Portal Depth (Homeowner + Subcontractor)

> **Phase:** A (Wave 4) · **Autonomy:** AUTO · **Depends on:** L01 (signed asset URLs), L11 (invoice PDF)
> **Owns gap-register:** §3.10.5–3.10.6 · **Decision:** ADR-0010
> **Intra-wave order:** L11 lands before L13-S2; the homeowner invoice **Pay online** button is
> owned by L14-S5 (L13-S2 renders the invoice + PDF link only, leaving a slot for the pay CTA).

## Purpose
The homeowner and subcontractor portals have landing pages and list views, but their
**detail views are empty-state placeholders**, and `/sub/settings` + `/sub/profile`
are stubs/missing. Since both portals are launch-required, this epic builds out the
read-appropriate detail surfaces with proper states, scoping, and tests.

## Stories

### L13-S1 — Homeowner property detail
- **Client:** `homeowner/properties/[id].vue` — read-only property summary, current job
  stage/timeline, compliance status, key dates, document links (signed URLs from L01/L11).
- **Server:** ensure homeowner service returns only the user's linked properties; tenant +
  membership scoped.
- **Tests:** e2e — homeowner sees only their property; cross-property id → 403/empty.

### L13-S2 — Homeowner quote + invoice detail
- **Client:** `homeowner/quotes/[id].vue` (read-only quote with accept/decline if allowed)
  + invoice detail with PDF (L11) and, post-L14, "Pay online".
- **Tests:** e2e — homeowner quote/invoice detail renders scoped; no admin/$ internals leak.

### L13-S3 — Subcontractor work-order + quote detail
- **Client:** `sub/work-orders/[id].vue` — scope, address, schedule, materials, **no $**;
  accept/reject + status update + photo (storage). `sub/quotes/[id].vue` respond flow.
- **Server:** sub service returns only assigned WOs/quotes for the sub-user.
- **Tests:** e2e — sub sees only assigned work; financials absent; status update persists.

### L13-S4 — Subcontractor profile + settings
- **Client:** `sub/profile.vue` (company, license #, insurance expiry, contact) + COI link;
  replace `/sub/settings` stub with notification preferences or fold into profile.
- **Server:** sub-user can update own profile fields (scoped); COI via storage (L02).
- **Tests:** e2e — sub edits profile → persists; COI upload round-trips.

### L13-S5 — Portal empty/loading/error-state polish + nav truth
- **Client:** every portal list/detail has proper loading skeleton, empty state, and error+
  retry; bottom-nav targets all resolve.
- **Tests:** persona×route matrix for homeowner + sub; axe (via L09) on each.
- **Acceptance:** no empty-state-only detail pages remain in either portal.
