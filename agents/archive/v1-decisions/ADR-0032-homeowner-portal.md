# ADR-0032 — Homeowner portal (W3-4 / EH-O)

- **Status:** Accepted
- **Date:** 2026-05-15
- **Slice:** W3-4 / EH-O
- **Owners:** Build agents

## Context

Homeowners are the customer-facing persona — they receive quotes,
sign off on inspections, and pay invoices. Until W3-4 they had no
portal at all; admin emailed PDFs and chased payment by phone.

W3-4 introduces the first read-mostly homeowner surface so the
homeowner can:

1. See the properties they own / occupy.
2. View quotes for those properties.
3. View invoices for those properties.

Write actions (accept/reject quote, pay invoice) are deliberately
deferred to W4; v1 is a transparency surface that reduces inbound
phone calls.

## Decisions

### D1. New `homeowner` role + new join table `homeowner_users`.

The seven existing roles (`super_admin`, `org_admin`, `org_manager`,
`field`, `sub_contractor`, `viewer`) do not include a customer-facing
persona. We considered reusing `viewer` and rejected: `viewer` is the
org-internal read-only role (e.g. accountants), not a tenant-of-the-
customer. Conflating them would force every permission check to
disambiguate between "viewer with full org read" and "homeowner
limited to their property". A dedicated role keeps the gates explicit.

`homeowner_users` rows attach a user to a property with a `kind`
flag (`owner` / `tenant` / `spouse` / `other`). One property can
have multiple homeowner users; one user can be attached to multiple
properties (rental portfolio scenario).

### D2. Property-level scoping is enforced by the service, not the UI.

The homeowner portal pages read `homeowner.listForUser(userId, orgId)`
and filter quote/invoice lists client-side by membership property
IDs. The server-side trust boundary is the tenant firewall +
explicit `listForUser` scoping — UI is free to ask for an unrelated
property's data, the service will reject it. We do NOT add a new
"only my properties" predicate to quote/invoice list inputs because
the existing pagination + filtering surface is generic; adding a
role-specific shortcut would scatter customer-facing knowledge across
unrelated services.

### D3. Open-quote / open-invoice analytics events.

`homeownerQuoteViewed` and `homeownerInvoiceViewed` are in the event
catalog and are ready for the admin notification feed (so PM sees
"customer viewed your quote"). We did NOT wire emission in W3-4
itself — the detail page implementations land separately in W4. The
events are in the catalog because adding events later requires
migrations to the notification template registry and updating ADRs;
landing the catalog entries now makes that follow-up additive.

### D4. Layout is independent of admin / sub / field shells.

`app/layouts/homeowner.vue` is a 4-tab strip (Home / Properties /
Quotes / Invoices) with a sticky header. No global sidebar, no admin
chrome — customer expectation is a Shopify-style portal, not a CRM.
All copy goes through `useLabel().t('homeowner.*', ...)` so customers
can re-skin labels (`Quotes` → `Estimates`, etc.) without code
changes.

## Consequences

- New table: `homeowner_users`.
- New role: `homeowner` added to `RoleSchema`, the `roleEnum` Drizzle
  enum, `ALL_ROLES`, the nav config, and `usePermissions.ts`.
- New events in catalog: `homeownerInvited`, `homeownerAccepted`,
  `homeownerQuoteViewed`, `homeownerInvoiceViewed`.
- New service: `IHomeownerService` with `listForProperty`,
  `listForUser`, `invite`, `remove`.
- New layout/middleware/pages under `app/layouts/homeowner.vue`,
  `app/middleware/homeowner-role.ts`, `app/pages/homeowner/*`.

## Decision cast down

- **Reject:** allowing the homeowner to sign quotes from this portal
  in W3-4. The signature pad lands in the field flow first; bringing
  it into the homeowner surface requires the W4 payments rail and
  defer-to-PM workflow.
- **Reject:** showing notification feed to homeowners. The feed is
  org-team scoped; homeowner alerts (when added) will flow via
  email/SMS, not the in-app feed.
