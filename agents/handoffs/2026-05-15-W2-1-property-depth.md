# Handoff — W2-1 / EH-E (Property Depth)

Date: 2026-05-15
Slice: W2-1 (epic head EH-E)
ADR: [ADR-0018](../decisions/ADR-0018-property-depth.md)

## What shipped

* Five new persisted entities: `buildings`, `building_sections`,
  `contacts`, `property_photos`, `property_attachments` — schemas were
  pre-landed; this slice built the contracts, mocks, real services,
  factories, UI pages, and tests on top of them.
* Seven new nullable columns on `properties`: `lot_size_acres`,
  `parcel_number`, `year_built`, `access_notes`, `gate_code`,
  `special_instructions`, `primary_contact_id`.
* New `IPropertyService.getWithDepth(propertyId, organizationId)` →
  `PropertyDepth { property, buildings: BuildingWithSections[],
  contacts, primaryPhotoUrl }`. Real service uses a single batched
  section query (one `IN (…)` over all building ids) grouped in-memory
  by `buildingId`.
* New CMS label namespaces (per ADR-0014): `property.tabs`,
  `building.kinds`, `contact.kinds`, `attachment.kinds`.
* New UI sub-navigation `PropertyPropertyDepthNav` mounted on every
  depth route; the existing tabbed property hub got three new
  Overview cards (property details, primary contact, primary photo)
  plus a clickable buildings-tile grid.
* Migration: `server/db/migrations/0007_open_toro.sql`.

## Files

### Created

* `shared/contracts/building.ts`
* `shared/contracts/contact.ts`
* `shared/contracts/property-photo.ts`
* `shared/contracts/property-attachment.ts`
* `shared/mocks/building.mock.ts`
* `shared/mocks/contact.mock.ts`
* `shared/mocks/property-photo.mock.ts`
* `shared/mocks/property-attachment.mock.ts`
* `server/services/building.real.ts`
* `server/services/contact.real.ts`
* `server/services/property-photo.real.ts`
* `server/services/property-attachment.real.ts`
* `app/components/property/PropertyDepthNav.vue`
* `app/pages/admin/properties/[id]/buildings/index.vue`
* `app/pages/admin/properties/[id]/buildings/[buildingId].vue`
* `app/pages/admin/properties/[id]/contacts.vue`
* `app/pages/admin/properties/[id]/photos.vue`
* `app/pages/admin/properties/[id]/attachments.vue`
* `tests/unit/buildings.test.ts`
* `tests/unit/contacts.test.ts`
* `tests/unit/property-depth.test.ts`
* `tests/e2e/property-depth.spec.ts`
* `agents/decisions/ADR-0018-property-depth.md`
* `server/db/migrations/0007_open_toro.sql`

### Modified

* `shared/contracts/property.ts` — 7 new nullable fields + depth
  schemas + `getWithDepth()` on `IPropertyService`.
* `shared/contracts/services.ts` — added `building`, `contact`,
  `propertyPhoto`, `propertyAttachment` to `BulwarkServices`.
* `shared/contracts/index.ts` — barrel append-only.
* `shared/contracts/label.ts` — new namespaces.
* `shared/labels/defaults.ts` — new dictionaries.
* `shared/mocks/property.mock.ts` — `attachDepthSources()` setter +
  `create()` extended + `getWithDepth()`.
* `shared/mocks/fixtures.ts` — `FIXTURE_PROPERTIES` extended with
  the 7 new fields (all `null`).
* `shared/mocks/factory.ts` — instantiates the four new mocks; wires
  `propertyMock.attachDepthSources({ building, contact, photo })`.
* `server/services/_row-mappers.ts` — `dbPropertyToContract` extended
  + 5 new mappers.
* `server/services/property.real.ts` — `create` / `update` accept the
  7 new fields; new `getWithDepth()` method.
* `server/utils/services-factory.ts` — instantiates the four new
  real services.
* `app/pages/admin/properties/[id]/index.vue` — mount the depth nav,
  parallel `getWithDepth` fetch, three new Overview cards + buildings
  tile section.
* `BUILD_STATUS.md` — Recent Completions row appended.

## Test results

* `pnpm exec vitest run tests/unit` → **152 / 152 passing** (was 130).
  New tests: buildings 4, contacts 2, property-depth 2.
* `pnpm exec vitest run tests/unit/buildings.test.ts
  tests/unit/contacts.test.ts tests/unit/property-depth.test.ts` →
  8 / 8 passing.
* `pnpm exec vue-tsc --noEmit` → **exit 0, zero errors.**
* Playwright `tests/e2e/property-depth.spec.ts` not executed in this
  session — local Playwright run was not requested. Spec is wired
  against the existing `signInAsAdmin` helper and the standard
  `chromium-only` skip.

## Key design choices

* **Free-string `kind` columns** (not Postgres enums) on buildings,
  sections, contacts, attachments — every kind resolves through the
  CMS label registry so an org can rename "Detached garage" → "Shop"
  per ADR-0014.
* **Setter-based depth wiring on `MockPropertyService`** (not
  constructor args) to break the property↔building↔contact↔photo
  construction cycle without an interface change. The factory calls
  `attachDepthSources` right after the four mocks are built.
* **Batched section read in `getWithDepth`** — one SQL query for all
  sections of all the property's buildings, then group in memory by
  `buildingId`. Avoids N+1 over building count.
* **Up/down arrow reorder for sections** instead of drag-and-drop —
  section counts are tiny and ARIA-keyboard support is free.
* **Photo and attachment uploads accept data URLs today**, marked
  with `// TODO(W3-1): swap for sealed-secret S3/R2 signed-URL upload`
  at every create() in the real services. The contract is
  upload-agnostic; W3-1 will not require a contract change.

## Deferred polish

* The e2e spec (`tests/e2e/property-depth.spec.ts`) was not executed
  in this session — Playwright local run was not requested.

* Scoping inspection results to `building_id` / `section_id` — the
  inspection-engine slice (W2-2) shipped before W2-1 so the join
  columns aren't there yet. When inspection schemas are next
  touched, add the nullable FKs and a list-by-section query.
* Photo "pin to building / section" is supported in the schema but
  the UI ships with `buildingId` / `sectionId` nullable on upload
  and no in-place re-pin affordance yet — covered by W3-2 (gallery
  curation).
* Drag-and-drop section reorder, photo reorder — when section /
  photo counts start exceeding a few dozen.
* Mocking out the W3-1 upload seam in tests — the e2e spec uploads
  a real 1×1 PNG buffer; once W3-1 lands we'll mock the signed-URL
  flow instead of letting the data URL persist.
