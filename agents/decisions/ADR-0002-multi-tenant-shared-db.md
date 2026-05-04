# ADR-0002 — Multi-tenant via shared DB + organizationId column

## Status
Accepted — 2026-05-03

## Context
Bulwark is multi-tenant from day one ([BRD §2](../../docs/BULWARK_BRD.md), [TECH §2](../../docs/BULWARK_TECH.md)).
First tenant is the Drew + Matthew + Jeff op entity; future tenants are other
retrofit GCs.

## Decision
Use **Option A: shared database, `organizationId` column on every tenant-scoped
table**. The tenant firewall lives at the **service layer** (not the route
layer): `requireOrgMembership(userId, organizationId)` is the first line of
every service method that touches tenant data. `organizationId` is **never**
taken from the request body — always from the auth context.

## Consequences
- Every Drizzle table for tenant data carries `organizationId uuid NOT NULL` +
  index.
- Every service method takes explicit `userId` + `organizationId`.
- Cross-tenant data leak = critical bug; architect-role review checks for it.

## Alternatives considered
- **Database-per-tenant** — rejected: ops overhead, poor for a small ops team.
- **Schema-per-tenant** — rejected: migration complexity grows linearly with
  tenants; Neon doesn't optimize for it.
- **Route-layer firewall** — rejected: too easy to forget on a new route. The
  service layer is the single chokepoint.
