# ADR-0029 — Field / Mobile / PWA surface (hand-rolled)

- **Status:** Accepted
- **Date:** 2026-05-15
- **Slice:** W3-3 / EH-M
- **Owners:** Build agents

## Context

Bulwark's admin surface ships first, but the field crew (role=`field`)
is the persona that mints the revenue: they arrive on-site, capture the
work, and close the loop. The pre-W3-3 `/field/dashboard` (E10-S1) was
a placeholder — fixed sidebar, KPI cards, no offline story, no install
target. W3-3's brief was to ship the first real mobile shell:

1. A dedicated **field layout** with a four-tab strip (My Day / Inspect
   / Photos / Notes) — not the global sidebar.
2. A "My Day" surface listing today's scheduled work orders for the
   signed-in field user.
3. A job detail view with **geolocation-stamped check-ins** that land
   in the audit log.
4. **Photo capture** wired to the device camera via
   `<input type="file" capture="environment">`.
5. An **inspection host** that reuses the W2-2 dynamic form.
6. **PWA shell** (manifest + service worker) so the site can be
   installed to the home screen.
7. An **offline-write queue** seam so future Phase 2 promotion (real
   Background Sync, conflict reconciliation) is purely additive.

## Decisions

### D1. Hand-roll the PWA — do NOT add `@vite-pwa/nuxt`.

`@vite-pwa/nuxt` is the standard Nuxt 3 plugin (Workbox under the hood).
We considered adopting it and rejected:

- It ships its own service worker generator and runtime, which would
  fight the simple cache-first / network-first strategy we want for v1.
- Workbox precaching needs a build step; in dev the cache becomes
  stale and confuses the offline-queue UX during local iteration.
- The dep adds ~280kB to the dev bundle for behaviour we already get
  in ~50 LOC of vanilla service worker.

**Decision:** ship a hand-rolled `public/manifest.webmanifest`,
`public/sw.js`, and a tiny `app/plugins/pwa.client.ts` that registers
the worker on `load`. Revisit @vite-pwa/nuxt only when we need
Workbox's expiration / strategy primitives.

### D2. Offline queue lives in `localStorage`, keyed by user.

The W3-3 deliverable required an "offline writes seam," not a
production-grade offline-first system. We chose `localStorage` because:

- It's synchronous and 5 MB is plenty for the queue shape
  (`{ url, method, body }` JSON entries).
- It survives a single tab reload, which is the dominant
  "I lost signal for 30s" recovery mode the field persona hits.
- The drain logic listens to the browser `online` event and flushes
  FIFO — no SW Background Sync API needed yet.

The composable (`app/composables/useOfflineQueue.ts`) exports
`enqueue` / `drain` / `size` and namespaces per-user
(`bulwark.offline.<userId>`) so two field crew sharing a tablet don't
collide.

**Promotion path (deferred to Phase 2):** lift the queue to
IndexedDB inside the service worker; use the Background Sync API for
true cross-session retries; reconcile via the existing audit_log /
domain event stream.

### D3. Check-ins are audit_log rows, not their own table.

A check-in is, semantically, "this user was at this property at this
time." That is exactly the row shape `audit_log` already stores.
Spinning up a new `field_check_ins` table would mean:

- A new migration for one column (geo coords) that fits trivially in
  `audit_log.metadata`.
- A new contract + service + factory + RPC method + tests.
- Two queries to render "history" (the audit log + the check-ins
  table) — or duplicate writes.

**Decision:** check-ins write to `audit_log` with
`action = 'state_change'` and `metadata.kind ∈ { 'field.check_in',
'field.check_out' }`. A small helper `AuditService.getCheckInsForWorkOrder`
encapsulates the metadata filter so callers don't reach into the JSON
ad-hoc.

**Rejected alternative:** add a new `AuditAction` enum value
`'check_in'`. That breaks `AuditActionSchema` consumers and is a
contract change for a derivative concept; the metadata namespace gives
us identical query power without the blast radius.

### D4. `listForFieldUser` is on the real service but NOT in the
shared `IWorkOrderService` interface.

The field My Day query is a read-only, surface-specific helper that
doesn't belong in the mock parity contract. We added it to
`RealWorkOrderService` and the mock for symmetry, but deliberately
kept it off the interface so the RPC dispatcher doesn't expose it as
a public method. The field API endpoint
(`server/api/field/my-day.get.ts`) calls the service directly via
`useService('workOrder')` cast to the concrete real class.

**Implication:** the slot-level "assigned to this user" filter is a
TODO inside `listForFieldUser` — the current implementation returns
all WOs in the date range for the org. The unit test
(`tests/unit/field-wo-list.test.ts`) pins the date filter; the
user filter lands when slot.assignedToUserId becomes a hot path.

### D5. Inspection host reuses the W2-2 form unchanged.

The `app/pages/field/jobs/[woId]/inspect.vue` is a thin shell that
finds or creates an inspection row, then renders
`<InspectionForm :inspection-id>` inside the field layout. We did NOT
fork the inspection form, did NOT add a "field mode" prop, and did NOT
duplicate autosave. When the offline queue is promoted in Phase 2,
the queue lives at the RPC dispatcher layer — the form needs no
changes.

### D6. Role guard is its own middleware, not a layout-level check.

`app/middleware/field-role.ts` exists because (a) the field layout is
shared with future non-field surfaces (e.g. a sub-contractor PWA
in W4) that need a different guard, and (b) layout middleware fires
AFTER page middleware in Nuxt 3 — using the layout for auth would
mean the page setup runs against a session that might not have the
right role. Per-page `definePageMeta({ middleware: 'field-role' })`
fires before component setup.

## Consequences

- **Adds:** 0 new npm deps. 1 layout, 1 middleware, 1 composable, 1
  plugin, 1 install-banner component, 5 field pages, 3 field API
  endpoints, 1 service method (+ mock parity), 1 audit helper, ~12 new
  default labels, 1 manifest, 1 service worker, 4 e2e specs, 2 unit
  specs. Total LOC added: ~1,400.
- **Removes:** Nothing. The legacy `/field/dashboard`, `/field/properties`,
  `/field/work-orders`, `/field/sync-queue`, `/field/assessments`
  surfaces remain — they're the entry points the existing
  `happy-path-field.spec.ts` covers. The new `/field` index is the
  PWA home screen target.
- **Tradeoffs:**
  - localStorage queue means writes don't sync across SW boundary —
    acceptable for a single-tab field user, NOT acceptable when the
    user has the PWA installed AND a browser tab open. Document this
    as a known limitation; the promotion path (D2) fixes it.
  - Check-in coordinates are stored as raw floats in audit metadata.
    No geofence validation v1 — a future ADR can layer that on as
    a "did the user actually arrive at the property" gate without
    touching the storage shape.

## Open questions (deferred)

1. **Photo upload backend.** v1 stores the photo as a data URL inside
   `propertyPhotos.url` via the existing service. W3-1 lands the
   storage abstraction; once it does, the field photo page swaps to a
   pre-signed S3 PUT in a one-line change.
2. **Pull-to-refresh.** Native gesture, not in scope for v1. The
   refresh button is the workaround.
3. **Push notifications.** Out of scope for W3-3; lives behind
   ADR-0027 (notifications-dispatch) once the field surface needs
   "your next job starts in 15min" surfacing.

## References

- BUILD_STATUS.md entry: W3-3 (this slice)
- Handoff: `agents/handoffs/2026-05-15-W3-3-field-pwa.md`
- Predecessors: ADR-0027 (notifications), ADR-0014 (labels),
  ADR-0008 (rich comments), ADR-0007 (Playwright required).
