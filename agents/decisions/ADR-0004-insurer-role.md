# ADR-0004 — Insurance Representative role: read-only, link-scoped

- **Status:** Accepted (2026-06-30) · **Epic:** L15

## Context
The sponsor needs an insurer-facing user who can pull compliance/status reports across
**multiple** properties but can **never write**. Existing roles don't fit: homeowner is
single-property-self; subcontractor executes jobs. No insurer role/linkage exists.

## Decision
Add role `insurance_representative` to `RoleSchema` **and** the DB `roleEnum` in lockstep.
**Tenancy (decided):** for the locked single-GC-org launch, an insurer rep holds a
`memberships` row in that one GC org (role=`insurance_representative`) — the same precedent
the homeowner portal set so the session keys to a real `activeOrganizationId`. Every insurer
service method therefore takes `organizationId` and calls `assertSameTenant` like any other
service. Access is **read-only** and further scoped by a new `insurer_links(org_id,
insurer_user_id, scope ∈ org|property, property_id?)` table (granted/revoked by a GC admin):
a request must pass `assertSameTenant(orgId)` **and** `assertInsurerScope(orgId, propertyIds)`.
No write service method or route is reachable for the role (route guard + service guard +
persona×route negative tests). A dedicated `/insurer/**` portal exposes a multi-property
report dashboard + read-only property views with signed document downloads. **Multi-GC-org
insurers are post-launch** (no cross-org session model exists today).

## Consequences
- A safe, auditable external-stakeholder surface without exposing GC internals or writes.
- Capability sits above homeowner (multi-property) and below subcontractor (no execution).

## Alternatives rejected
- Reuse `viewer` (not multi-property/insurer-scoped). Insurer-org self-service admin
  (post-launch). Granting any mutation (explicitly forbidden).
