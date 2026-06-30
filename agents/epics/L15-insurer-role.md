# L15 — Insurance Company Representative Role + Portal

> **Phase:** B (Wave 4) · **Autonomy:** AUTO (single-GC-org tenancy decided — see Role design) · **Depends on:** L06, L07
> **Owns gap-register:** §2 (net-new) · **Decision:** ADR-0004
> **Net-new feature** — there is no insurer role or linkage in the codebase today.

## Purpose
Introduce a new **read-only** role, `insurance_representative`, that can pull
compliance and status **reports across multiple properties** belonging to the GC org(s)
it is linked to — but **cannot create, edit, or delete** anything (no properties,
quotes, work orders, invoices, or settings). This sits **above** homeowner
(multi-property, not single-property-self) and **below** subcontractor (no job
execution, no writes at all).

## Role design (ADR-0004)
- **Tenancy model (DECIDED — closes the open question):** for the locked single-GC-org
  launch, an insurer rep gets a `memberships` row (role=`insurance_representative`) in that
  **one** GC org — exactly the precedent the homeowner portal set
  ([homeowner.real.ts](server/services/homeowner.real.ts)) so the existing session/auth keys
  to a real `activeOrganizationId`. Every insurer contract therefore takes `organizationId`
  and calls `assertSameTenant` like every other service. This is fully buildable with no
  sponsor question for the locked scope.
- **Capability:** read property compliance status, assessment/inspection outcomes,
  compliance documents (download), and high-level invoice/job status — **for linked
  properties only**. No financial line-item internals beyond status/total unless the GC
  opts in. **Zero write endpoints** are reachable.
- **Scoping model:** `insurer_links(org_id, insurer_user_id, scope ∈ org|property,
  property_id?)` records WHICH properties (or the whole org) a rep may view **within that
  org**. Access = `assertSameTenant(orgId)` **AND** `assertInsurerScope(orgId, propertyIds)`
  (every requested property is in the link set; `scope=org` grants all of that org's
  properties).
- **Firewall:** insurer requests pass the standard tenant firewall **plus**
  `assertInsurerScope()`. Any write service method is unreachable for the role (route +
  service guard + persona×route test). Multi-GC-org insurers are **post-launch** (would need
  a cross-org session model that does not exist today).

## Stories

### L15-S1 — Role enum + permission wiring (lockstep)
- **Contract/Schema:** add `insurance_representative` to `RoleSchema`
  ([_shared.ts](shared/contracts/_shared.ts#L14)) **and** `roleEnum`
  ([users.ts](server/db/schema/users.ts)) in the same migration; add to `ALL_ROLES`,
  `ROLE_GROUPS` (new `insurer` group), and default-permissions (read-only set).
- **Tests:** unit — role parses; permission map grants only read capabilities; lockstep
  test asserts contract enum == DB enum.
- **Acceptance:** new role exists end-to-end; no write capability in its permission set.

### L15-S2 — `insurer_links` linkage model + admin management
- **Schema:** `insurer_links(id, org_id, insurer_user_id, scope ∈ org|property,
  property_id NULLABLE, granted_by, audit...)` with uniqueness per (insurer_user, scope, target).
- **Contract/Server:** `IInsurerService.{ listLinks, grantLink, revokeLink, listScopedProperties }`
  + `assertInsurerScope(resolver, { propertyId|orgId })`. Real + mock parity.
- **Client:** GC admin surface `settings/insurers.vue` — invite an insurer rep, grant/revoke
  property/org scope.
- **Tests:** e2e — admin grants a property link; insurer can then see exactly that property;
  revoke removes access. Cross-scope request → 403.

### L15-S3 — Insurer invite + auth landing
- **Server:** extend invite flow to issue `insurance_representative` invites (reuse
  `pending_invites` + accept-invite).
- **Client:** insurer lands on `/insurer` after accept; role middleware `insurer-role.ts`
  guards `/insurer/**`; non-insurer → 403.
- **Tests:** e2e — invite → accept → lands on insurer home; other roles 403 on `/insurer/**`.

### L15-S4 — Insurer reporting contract + service (read-only, scoped)
- **Contract:** `shared/contracts/insurer-reporting.ts` —
  `insurerPropertyBrief({ organizationId, range })` → per-property rows {address, compliance
  status, last assessment result, open WO count, invoice status, compliance-doc availability}
  for the caller's linked properties **in that org**; `insurerComplianceExport({ organizationId,
  range })` (CSV). Every method runs `assertSameTenant(organizationId)` **then**
  `assertInsurerScope(organizationId, resolvedPropertyIds)`.
- **Server:** `insurer-reporting.real.ts` resolves the rep's `insurer_links` for the active org,
  joins read-only over exactly that property set; reuses L06 indexes; **never** calls a write path.
- **Tests:** integration — brief returns only linked properties; a property outside the link set
  is excluded; a cross-org request → `TenantViolationError`; query-count sane (no N+1).

### L15-S5 — Insurer portal UI (multi-property dashboard + property read view)
- **Client:** `app/layouts/insurer.vue` + pages: `/insurer` (portfolio dashboard: property
  ×compliance×invoice-status matrix, filters, date range, **Export CSV**), `/insurer/properties/[id]`
  (read-only compliance + document downloads via signed URLs), `/insurer/reports`.
- **Server (downloads):** insurer document downloads are minted by **entity-scoped** insurer
  service methods that verify the document belongs to a linked property — NOT the generic
  org-scoped `/api/storage/presign-download` (which only checks the org prefix; see storage
  L01-S2 P1-1 / gap-register §3.1.7).
- **Tests:** e2e — insurer sees the portfolio of linked properties, opens one, downloads a
  compliance doc; sees **no** create/edit controls anywhere.

### L15-S6 — Negative-surface hardening (persona×route matrix)
- **Tests:** extend the persona×route matrix to include `insurance_representative` across a
  representative set of **write** routes/endpoints (property create, quote create, invoice
  mutate, settings) asserting 403/redirect; and **read** routes asserting allow only within
  scope. Add a service-level test that no `IInsurerService`/insurer route reaches a mutation.
- **Acceptance:** the role is provably read-only and scope-bound; matrix is regression-gated.

## Decisions NOT taken (launch scope)
- Insurer **org-level** self-service (an insurer company managing many reps) — launch uses
  GC-admin-granted links per rep; insurer-org admin is post-launch.
- Writing back to Bulwark (e.g., insurer approval workflows) — explicitly out of scope.
