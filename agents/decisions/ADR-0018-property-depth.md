# ADR-0018 — Property depth: buildings, sections, contacts, photos, attachments

* Status: Accepted
* Date: 2026-05-15
* Slice: W2-1 / EH-E

## Context

The single-table `properties` row that landed in Phase 1 modelled a
property as a flat record (address + status + a few free-form fields).
That was enough to ship the assessment / quote / WO / invoice flows
but it leaves a real-world property under-modelled:

* A property usually has **more than one building** (main house +
  detached garage + shop), and field crews need to scope inspection
  results to a specific building.
* A building often has named **sections** (north roof, south roof,
  east wall) that the crew wants to mark individually as passing or
  failing.
* A property has **multiple contacts** (owner, site contact, insurance
  contact), one of which is "the primary contact" — the person to call.
* Operators want to attach **photos** and **documents** (permits,
  insurance certs) to the property as a whole, with the option to
  pin a photo to a specific building or section.
* Operators want **deep metadata** — lot size, parcel number, year
  built, gate code, special access instructions — without having to
  stuff it into the free-form `notes` field.

## Decision

Add five new tables, one new bag of columns on `properties`, and a
small set of contracts / mocks / real services that expose them.

### New tables

* `buildings(id, property_id, name, kind, year_built, sq_ft, story_count, notes, sort_order, deleted_at, …)`
* `building_sections(id, building_id, label, kind, notes, sort_order, deleted_at, …)`
* `contacts(id, property_id NULL, client_id NULL, full_name, kind, email, phone, role, is_primary, notes, deleted_at, …)`
* `property_photos(id, property_id, building_id NULL, section_id NULL, url, thumbnail_url, caption, content_type, file_size_bytes, taken_at, uploaded_by_user_id, sort_order, deleted_at, …)`
* `property_attachments(id, property_id, kind, file_name, url, content_type, file_size_bytes, notes, uploaded_by_user_id, deleted_at, …)`

### New columns on `properties`

* `lot_size_acres numeric(12,4)` — exact acreage; numeric to preserve
  precision past insurance-grade rounding.
* `parcel_number text` — county parcel identifier.
* `year_built int`
* `access_notes text`
* `gate_code text`
* `special_instructions text`
* `primary_contact_id uuid` — denormalised pointer; the single
  `is_primary=true` row in `contacts` is the source of truth, this
  column is a query convenience the UI uses to render the overview
  card without a second fetch.

All five tables ship with the standard envelope: `id uuid v4`,
`organization_id`, `created_at`, `updated_at`, `deleted_at` (soft
delete), and a foreign key back to `organizations` for the tenant
firewall.

### Contracts (`shared/contracts/`)

* `building.ts` — Zod schemas + `IBuildingService` (both buildings and
  sections live on the same interface because the section CRUD is
  always scoped to a building).
* `contact.ts` — `IContactService` with `setPrimary(id)` that demotes
  siblings atomically.
* `property-photo.ts` — `IPropertyPhotoService` with `reorder()`.
* `property-attachment.ts` — `IPropertyAttachmentService` with no
  `update()` by design (replace-by-delete-then-upload).
* `property.ts` (extended) — adds the seven new fields, plus
  `BuildingWithSectionsSchema`, `PropertyDepthSchema`, and
  `IPropertyService.getWithDepth(propertyId, organizationId)` for a
  single nested-shape fetch the overview card consumes.

`kind` columns on buildings, sections, contacts, and attachments are
free-string columns (not enums) — every kind value resolves through
the CMS label registry (ADR-0014, namespaces `building.kinds`,
`contact.kinds`, `attachment.kinds`), so an org can rename
"Detached garage" → "Shop" without a code change.

### Services (`shared/mocks/`, `server/services/`)

* Mock services follow the existing in-memory-array pattern; each
  exports a `__reset*Mock()` helper for unit tests.
* Real services follow the existing `withAudit` / `assertSameTenant`
  pattern; mutations are wrapped in a single transaction so the
  audit row and the domain write commit together.
* `MockPropertyService.getWithDepth()` reads from the building /
  contact / photo mocks via an `attachDepthSources({ building,
  contact, photo })` setter wired in `shared/mocks/factory.ts`. We
  resolve the constructor cycle (property needs building, building
  doesn't need property) with a setter rather than constructor args.

### Upload stub seam (W3-1 follow-up)

Photo and attachment `create()` accept a data URL or
`local://{photos|attachments}/<uuid>` placeholder. A
`// TODO(W3-1): swap for sealed-secret S3/R2 signed-URL upload` marker
sits at every create() in the real services. The contract is
upload-agnostic — the URL is a string — so the W3-1 swap will not
need a contract change.

## Alternatives considered

* **Single `property_metadata` JSON column** for the new fields.
  Rejected — Zod doesn't enforce JSON sub-shapes in the DB; a typed
  column gives Drizzle's row mapper a clear target and a normal
  column added per migration is cheap.
* **One service per surface** (separate `MockSectionService` from
  `MockBuildingService`). Rejected — section CRUD is read-modify-write
  on the same building's section list (especially `reorderSections`),
  so colocating saves a service round-trip on every reorder.
* **Mandatory `building_id` on every photo / inspection result.**
  Rejected — a property has photos that aren't building-specific
  (e.g. wildfire fuel break in the yard). `building_id` is nullable
  and the UI groups "unassigned" into its own filter chip.
* **Drag-and-drop section reorder.** Rejected for now in favour of
  up/down arrow buttons. Drag-and-drop costs a library and ARIA
  surface; the section count per building is tiny.

## Decisions cast down

* Per-tenant override of the **section kind list** (currently
  free-string + a default dictionary) is deferred — the CMS label
  registry already supports this, so the UI doesn't need a code
  change to add a new kind.
* Inspection results are NOT scoped to building_id / section_id yet
  — that wiring lands in a later slice (W2-2 inspection engine
  already shipped). When that happens, the inspection contracts pick
  up nullable `building_id` / `section_id` columns and join on this
  schema.
