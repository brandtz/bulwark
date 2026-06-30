# L01 — Object Storage Service

> **Phase:** A (Wave 1 foundation) · **Autonomy:** AUTO (R2 secret only at deploy)
> **Depends on:** — · **Unblocks:** L02, L11, L12, L14
> **Owns gap-register:** §3.1.1–3.1.5
> **Decision:** ADR-0001 (pluggable storage; prod rejects `data:`/`local://`)

## Purpose

Bulwark persists user assets (property photos, attachments, avatars, branding
logos, generated PDFs) as `data:` base64 or `local://` placeholder URLs. That is a
data-integrity and storage-cost landmine and cannot ship. This epic introduces a
single **pluggable object-storage service** with a real **Cloudflare R2** driver
for production and a **filesystem** driver for dev/test, plus a contract guard that
**rejects placeholder URLs in production**.

## Key decisions
- One server-side module `server/services/storage/` exposing a `StorageDriver`
  interface: `putObject`, `getSignedUploadUrl`, `getSignedDownloadUrl`, `deleteObject`,
  `headObject`. Drivers: `R2Driver` (wraps existing `server/jobs/r2.ts` S3 client) and
  `FsDriver` (writes under `.data/uploads/`, served via a dev-only handler).
- Driver chosen by `BULWARK_STORAGE_DRIVER` (`r2`|`fs`), defaulting to `fs` in dev/test
  and **failing closed to `r2` in production** (mirrors the backend mock guard).
- **Keying convention:** `{tenantId}/{entity}/{entityId}/{uuid}.{ext}` — tenant-prefixed
  so a future per-tenant bucket/policy is trivial.
- **Upload path:** client requests a short-lived **presigned PUT**, uploads directly,
  then calls the owning service with the returned **key** (not a URL). Services store
  the **key**; reads mint a short-lived **presigned GET**. This keeps credentials and
  bucket layout server-side and removes base64 bloat from the DB.
- **Prod guard:** a shared validator `assertStorableUrlOrKey()` throws if a persisted
  value begins with `data:` or `local://` when `NODE_ENV=production`.

## Stories

### L01-S1 — Storage driver interface + FsDriver + R2Driver
- **Contract:** `shared/contracts/storage.ts` — `StorageObjectKeySchema`,
  `PresignUploadInput/Output`, `PresignDownloadInput/Output`, `IStorageService`.
- **Server:** `server/services/storage/index.ts` (driver selector + env guard),
  `r2-driver.ts` (reuse `getR2Client`/bucket; presign via `@aws-sdk/s3-request-presigner`),
  `fs-driver.ts` (write/read under `.data/uploads/`, signed URL = signed local path with
  HMAC + expiry), and `server/api/_dev/uploads/[...key].get.ts` (dev-only static serve,
  404 in prod).
- **Tests:** unit for key generation, env-guard (prod→r2, dev→fs), HMAC expiry on fs
  signed URLs; round-trip put→head→get→delete on FsDriver.
- **Acceptance:** `pnpm typecheck` + new unit suite green; prod env with no R2 creds
  throws a clear startup error (not a silent stub).

### L01-S2 — Presign endpoints + tenant firewall
- **Server:** `server/api/storage/presign-upload.post.ts` and
  `presign-download.post.ts` — authenticated, tenant-scoped (`assertSameTenant` on the
  embedded `tenantId`), MIME allow-list + max-size per entity kind, rate-limited.
- **Tests:** e2e — unauthenticated → 401; cross-tenant key → 403; oversize/MIME reject
  → 400; happy path returns a URL that expires.
- **Acceptance:** presign round-trip works on FsDriver in CI; negative cases covered.

### L01-S3 — `assertStorableUrlOrKey` prod guard + rollout shim
- **Server:** `shared/utils/storage-url.ts` validator; wire into property-photo,
  property-attachment, avatar, branding create/update paths (call before persist).
- **Tests:** unit — `data:`/`local://` throws in prod, passes in dev; storage keys pass
  always.
- **Acceptance:** attempting to persist a placeholder URL in a simulated prod env throws;
  existing dev flows unaffected.

### L01-S4 — Storage health check + backfill report
- **Server:** `server/api/health/storage.get.ts` (admin) — driver, bucket reachability
  (R2 `headBucket` / fs writable), and a **count of legacy `data:`/`local://` rows** per
  asset table (read-only report).
- **Tests:** integration — health returns `ok` on fs; report counts seeded legacy rows.
- **Acceptance:** health endpoint green in CI; report surfaces legacy-asset counts for L02.
