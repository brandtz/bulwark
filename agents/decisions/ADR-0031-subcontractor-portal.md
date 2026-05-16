# ADR-0031 — Subcontractor portal (W3-4 / EH-N)

- **Status:** Accepted
- **Date:** 2026-05-15
- **Slice:** W3-4 / EH-N
- **Owners:** Build agents

## Context

The pre-W3-4 sub surface was a single placeholder page at
`/sub/dashboard` and a profile stub. Subs already had a `sub_contractor`
role and `pending_invites`-based invite flow, but no dedicated portal
to:

1. See work orders their team has been assigned to.
2. Accept or decline quotes requested from them.
3. Upload / review their Certificate of Insurance (COI) and see
   expiry warnings.
4. Manage which of their own teammates can sign in.

W3-4 ships that portal as a mobile-first surface independent of the
admin shell (mirroring the W3-3 field carve-out, ADR-0029).

## Decisions

### D1. New DB tables — `subcontractor_users` and `subcontractor_coi_docs`.

Why not extend `memberships`? Memberships already model org/role
attachment; the `subcontractor_users` row is the join between a
membership-bearing user and a subcontractor record. Splitting it lets
admins detach a user from a sub without revoking their org membership
(common when a sub's lead leaves but stays in the rolodex).

Why not reuse `compliance_docs` for COIs? Compliance docs are
property-scoped; sub COIs are sub-scoped and need their own expiry
scanner. The table is small (`fileUrl`, `fileName`, `expiresAt`,
`uploadedByUserId`, `notes`) and avoids polluting the property feed.

### D2. Tenant-firewall continues to apply at the service layer.

`resolveSubForUser(userId, organizationId)` is the cheap lookup used
by UI to figure out which sub the signed-in user belongs to.
Middleware does NOT call it — it only checks `role === sub_contractor`
to avoid an SSR round-trip per navigation. The deeper scoping (this
user → this sub → these COIs / quotes / WOs) is enforced server-side
on every method call by `assertSameTenant`.

### D3. `subQuoteResponded` does NOT advance the quote status.

We considered transitioning a quote to `accepted` / `declined` when
the sub responds. Rejected: the admin/PM owns the customer-facing
status. The sub's response is captured as an audit-logged event
(`subQuoteResponded`) the admin sees in the notification feed; only
after the admin confirms does the quote status transition. This
preserves the existing status pipeline (ADR-0016) and avoids
sub-side decisions overwriting PM intent.

### D4. COI expiry scanner is a service method + a thin job wrapper.

`subcontractorService.scanCoiExpiry({organizationId, withinDays?})`
returns rows expiring within the window and emits
`subCoiExpiringSoon` per row. The job wrapper
`server/jobs/coi-expiry-check.ts` is a loop over orgs; we deferred
registering a new `JobKind` enum value to avoid an extra migration
for a single feature. Admin can also trigger the scan manually via
`POST /api/jobs/coi-expiry-check`.

## Consequences

- New tables: `subcontractor_users`, `subcontractor_coi_docs`.
- New events: `subQuoteResponded`, `subCoiUploaded`,
  `subCoiExpiringSoon` (all in `shared/events/catalog.ts`).
- New service methods on `ISubcontractorService`: `listUsers`,
  `inviteUser`, `removeUser`, `resolveSubForUser`,
  `listMyAssignments`, `listMyQuotesRequested`, `listCois`,
  `uploadCoi`, `scanCoiExpiry`.
- New method on `IQuoteService`: `respondToQuote`.
- New layout/middleware/pages under `app/layouts/sub.vue`,
  `app/middleware/sub-role.ts`, `app/pages/sub/*`.
- Legacy `/sub/dashboard` and `/sub/profile` remain as
  back-compat redirects.

## Decision cast down

- **Reject:** giving subs the ability to upload COI files directly
  to R2 in v1. The portal accepts URL+filename+expiry (mirrors the
  admin compliance UX) and defers a real file picker to W4.
- **Reject:** showing every WO regardless of trade assignment.
  `listMyAssignments` looks at `workOrders.tradeSlots` for the
  sub's id; if no slot matches, the WO is hidden.
