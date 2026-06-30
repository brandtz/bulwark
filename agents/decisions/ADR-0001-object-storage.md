# ADR-0001 — Pluggable Object Storage; reject placeholder URLs in production

- **Status:** Accepted (2026-06-30) · **Epic:** L01, L02

## Context
Assets (photos, attachments, avatars, logos, PDFs) persist as `data:` base64 or
`local://` placeholders. That bloats the DB, leaks no signed-access control, and
cannot survive production.

## Decision
Introduce one server-side **storage service** with a `StorageDriver` interface
(`putObject`, `getSignedUploadUrl`, `getSignedDownloadUrl`, `deleteObject`,
`headObject`). Production driver = **Cloudflare R2** (reusing the existing S3 client);
dev/test driver = **filesystem**. Driver selected by `BULWARK_STORAGE_DRIVER`,
**failing closed to `r2` in production**. Clients use **presigned PUT** then submit a
**key**; services store keys; reads mint short-lived **signed GET** URLs. A shared
`assertStorableUrlOrKey()` **throws on `data:`/`local://` in production**.

## Consequences
- DB stores compact keys, not bytes; bucket layout + creds stay server-side.
- A migration/backfill re-homes legacy inline assets (L02-S5).
- Adding a CDN/per-tenant bucket later is a driver concern, not a schema change.

## Alternatives rejected
- Keep data URLs (DB bloat, no access control). Direct-from-client to R2 without a
  presign authority (leaks creds / bucket policy). A public avatars bucket (extra infra,
  no expiry control).
