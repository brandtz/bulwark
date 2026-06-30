# ADR-0025 — Per-org permission overrides (W2-5 / EH-I-G)

## Status

Accepted — 2026-05-15.

## Context

The five built-in roles (`super_admin`, `org_admin`, `org_manager`,
`field`, `viewer`) ship with a fixed default permission set in code
(`shared/auth/default-permissions.ts`). Two real-world pressures push
back on that:

- **Customer A** wants `org_manager` to send invoices; the default
  withholds it.
- **Customer B** wants `field` users to never see customer phone
  numbers; the default allows it.

Neither pressure justifies a new role. Both want to tweak ONE slug
for ONE role within ONE org. The decision was: how to encode that
diff without exploding the role catalog and without making "what
can role X do?" answerable only by reading the DB.

## Decisions

### 1. Defaults in code, overrides in the DB

The static catalog (`PERMISSION_SLUGS` + per-role default booleans)
lives in `shared/auth/default-permissions.ts`. The `permissions` table
([server/db/schema/permissions.ts](../../server/db/schema/permissions.ts))
stores **only diffs** keyed by
`(organizationId, role, permissionSlug)` — a row is present iff the
org has deviated from the default.

Implications:

- A freshly-seeded org has **zero** rows in `permissions`. Its
  effective permissions are exactly the catalog defaults.
- Adding a new permission slug is a code change to the catalog plus
  a release — **no migration needed**. (Compare to a hypothetical
  `permission_slugs` lookup table where every new slug ships a
  migration.)
- "What can `org_manager` do in this org?" requires `default +
  overrides`, computed by `getEffectivePermissions`.

### 2. Overrides are role-scoped, not user-scoped

`permissions.role` is the role enum, not a user id. A second axis
(per-user overrides) was rejected for v1 — it would require an admin
UI that scales to N users × M slugs and a runtime check that joins
on user id. The role axis is the right granularity for the use cases
on the table; per-user is a Phase 2 cleanup once customer demand
materialises (e.g. "make Sam, and only Sam, an exception").

### 3. Three-state semantics via row presence + `allowed`

| Row state                       | Effective answer            |
| ------------------------------- | --------------------------- |
| no row                          | catalog default for `role`  |
| row + `allowed = true`          | grant                       |
| row + `allowed = false`         | deny                        |

This keeps the merge logic in
[permission.real.ts](../../server/services/permission.real.ts)
`getEffectivePermissions` to a single pass:

```ts
const merged = getDefaultPermissionsForRole(role)
for (const r of rows) merged[r.permissionSlug] = r.allowed
return merged
```

The `merged` map is `Record<slug, boolean>` — callers don't care
**where** the answer came from, they just need the boolean.

### 4. `bulkUpsert` saves cell-by-cell; `resetToDefaults` is the rollback

The matrix UI (planned at `/settings/permissions`) saves edits via
`bulkUpsert` with one entry per cell touched. Reset is a single call:

```ts
permissionService.resetToDefaults(orgId)
// → hard-deletes every override row for orgId
```

`resetToDefaults` is intentionally explicit. There's no partial
"reset this row" verb — the catalog default is recoverable by
`upsert(allowed = <catalog default>)`, which writes a redundant row.
Operators wanting clean state issue a full reset.

### 5. Nullable `organizationId` reserves space for a future platform-global override

The column is nullable so that — in Phase 2 — Bulwark can grant or
deny a slug across **every** tenant (e.g. a platform-wide kill switch
on a deprecated feature). v1 always writes a concrete org id; the
nullable column is a no-op deployment migration when the platform
feature ships.

### 6. Audit captures every edit via the service-route hook

`upsert` and `bulkUpsert` are called through the generic
RPC dispatcher (`server/api/services/[service]/[method].post.ts`),
which writes an `audit_log` row per call. No explicit audit wiring
in the service; consistency with every other admin write path.

## Rejected alternatives

- **A `permission_slugs` lookup table with an FK from `permissions`.**
  Forces a migration on every new slug. The catalog-in-code approach
  (mirrors trades + status-pipelines per ADR-0013 / ADR-0016) is
  consistent across Bulwark.
- **Zod-enum the slug.** Same migration tax as a lookup table at the
  contract layer. The `z.string().min(1)` shape on
  [shared/contracts/permission.ts](../../shared/contracts/permission.ts)
  intentionally widens the wire to keep contract bumps decoupled from
  slug evolution.
- **Per-user overrides at v1.** Out of scope; deferred to Phase 2.
- **`onConflictDoUpdate` upsert.** Drizzle's upsert needs a target
  index expression that the readers of `permission.real.ts` would
  have to mentally compile; the select-then-update/insert path is
  clearer at this volume. v2 can switch when read frequency
  justifies the optimisation.
- **Soft-delete on reset.** Hard-delete is the explicit factory-reset
  lever. Audit captures the intent; soft-delete would muddy the
  "no row means default" invariant.

## Known debt

- **Matrix UI at `/settings/permissions` is not yet built.** The
  service + contract are live and consumed by the RPC dispatcher;
  the UI is planned for the follow-up slice that closes EH-I-G.
  Until then, overrides can be written via direct service calls
  (e.g. seed scripts, integration tests).
- **No "diff from defaults" preview.** Operators editing the matrix
  cannot see at a glance which cells are deviations vs. defaults
  without comparing visually. A `getDiffForOrg(orgId)` helper is on
  the W3-1 list.
- **No per-user overrides.** See §2 — deferred to Phase 2.
- **`getEffectivePermissions` is recomputed per request.** A
  per-(org, role) cache is the obvious next step once a profile run
  shows it matters; today it's two indexed queries.
