# L02 — Asset Uploads on the Storage Service

> **Phase:** A (Wave 1) · **Autonomy:** AUTO · **Depends on:** L01
> **Owns gap-register:** §3.1.1–3.1.4 · **Decision:** ADR-0001

## Purpose
Migrate every asset write/read path off `data:`/`local://` onto the L01 storage
service: property photos, property attachments, user avatars, and branding logos.
Existing UIs keep working; the bytes now live in R2 (prod) / fs (dev) and the DB
stores **keys**, with reads served via short-lived signed URLs.

## Key decisions
- Each owning service stores the storage **key** in its existing URL column; a
  read-time mapper swaps the key for a signed GET URL in the contract output (so
  client code that expects a URL is unchanged).
- Client upload widgets switch to: request presign → PUT bytes → **finalize** (server HEAD-
  verifies real size/content-type, deleting on violation) → submit the finalized key to the
  owning service.
- A one-time **backfill script** re-homes any legacy inline `data:` rows into storage
  and rewrites the column to a key (idempotent; dry-run by default).

## Preconditions (blocking — from L01-S2 skeptic)
Before any owning service persists a client-supplied storage key, BOTH must be closed:
- **NEW-1 (finalize TOCTOU):** a presigned PUT URL is reusable for its TTL, so an object can
  be overwritten AFTER finalize. Close it: have `finalize` return the object **etag**, store it
  with the key, and re-verify (HEAD + etag compare) at read — OR copy-on-finalize into an
  immutable key — OR adopt presigned-POST `content-length-range` + short TTL (gap §3.1.6/3.1.8).
  (Upload TTL already cut to 300s as interim mitigation.)
- **P1-1 (entity RBAC):** the owning service MUST verify the caller may access the specific
  entity before minting a download URL; the generic `/api/storage/presign-download` is
  org-scoped only (gap §3.1.7).

## Stories

### L02-S1 — Property photos → storage
- **Server:** `property-photo.real.ts` `create()` accepts a storage key (validated by
  `assertStorableUrlOrKey`), persists key; list/get map key→signed GET. Remove the
  `TODO(W3-1)` seam. Mock parity updated.
- **Client:** `app/pages/admin/properties/[id]/photos.vue` + field photos use the
  presign→PUT→submit flow; show upload progress + error/retry.
- **Tests:** e2e upload happy + oversize/MIME reject; unit for key→URL mapper.
- **Acceptance:** a photo uploaded in CI (fs driver) round-trips and renders via signed URL.

### L02-S2 — Property attachments → storage
- Mirror L02-S1 for `property-attachment.real.ts` + attachments page. Include
  content-disposition (download filename) on signed GET.
- **Tests:** e2e attach + download; cross-tenant key rejected.

### L02-S3 — Avatars → storage (migrate off inline base64)
- **Server:** `server/api/account/avatar.post.ts` switches to accept a storage key
  (still client-resized to ≤256²); persists key; session/user mapper returns signed URL.
- **Client:** `profile.vue` avatar widget uses presign flow; keeps client resize.
- **Migration:** drop the 64 KB base64 path; add backfill for existing inline avatars.
- **Guard:** add `assertStorableUrlOrKey` here once the persisted value is a key — avatar is
  currently intentionally inline + excluded from the L01-S3 guard like signatures (gap §3.1.3).
- **Tests:** e2e change/remove avatar; unit for resize+key submit.

### L02-S4 — Branding logo upload
- **Server:** branding update accepts a storage key for `logoUrl`.
- **Client:** `settings/branding.vue` gains a real upload (replaces manual URL field);
  live preview; remove.
- **Tests:** e2e upload logo → preview; permission gate (admin only).

### L02-S5 — Legacy asset backfill script + prod cutover check
- **Script:** `scripts/backfill-assets-to-storage.mjs` — scans photo/attachment/avatar
  tables for `data:`/`local://`, uploads to storage, rewrites to key; `--dry-run` default,
  `--apply`, per-table counts, localhost/secret guard.
- **Tests:** integration against seeded legacy rows; idempotent re-run = 0 changes.
- **Acceptance:** L01-S4 health report shows **zero** legacy rows after `--apply`.
