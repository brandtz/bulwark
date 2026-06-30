# ADR-0036 — Secret handling, encryption at rest, logger redaction

**Status:** Accepted (W5-2, 2026-05-16)
**Supersedes / extends:** ADR-0008 (rich comments), ADR-0021 (admin hub: providers), ADR-0022 (webhooks), ADR-0024 (TOTP MFA — origin of `server/utils/crypto.ts`), ADR-0034 (observability baseline — origin of `server/utils/logger.ts`).

---

## Context

W4-3 regression sweep flagged **Risk #3: unsealed secrets in `provider_configs` + `webhooks`** as "the single largest pre-launch security gap." Adjacent debt was visible in three other places:

- `.env.example` did not list every var the codebase reads; ops had to grep `process.env.*` to find them.
- The logger's redaction list (`server/utils/logger.ts`) covered the auth-credential family but not common PII patterns (SSN, DOB, card numbers, EINs, etc), and the walk was non-recursive — a credential nested under `request.headers.authorization` shipped through unredacted.
- The repo had no first-class secret scanner; pre-commit / CI had nothing to hook into.

W2-5 already shipped `server/utils/crypto.ts` (AES-256-GCM) for MFA secrets. That same primitive is the right tool for provider credentials — the previous "Phase 1 stores plaintext" position was always intended to be a temporary seam.

---

## Decision

1. **AES-256-GCM at rest for third-party provider credentials.**
   - `provider_configs.config_encrypted text` carries the sealed blob (base64 `iv|tag|ciphertext` of the JSON-stringified config). The legacy `config` JSONB column is retained for backfill and read-fallback so pre-W5-2 rows keep working until ops backfills, then a Phase-2 migration drops it.
   - `RealProviderConfigService` seals on every write (`upsert`) and exports `unsealProviderConfig(row)` for the two adapter modules (`_providers/email.ts`, `_providers/sms.ts`) that bypass the service.
   - Webhooks and api-keys are NOT plaintext today — `webhooks.secret_hash` is sha256 of the issue-once secret, `api_keys.secret_hash` is bcrypt. They keep their existing shape. (The webhook signing-key debt — using the hash as the HMAC key — is tracked in ADR-0022 §sec-debt and out of scope for W5-2.)

2. **Key sourcing.**
   - Encryption key is derived from (`BULWARK_ENCRYPTION_KEY` ?? `JWT_SECRET` ?? `NUXT_SESSION_PASSWORD`) via `sha256(secret)`. The first env var is new in W5-2 so production can rotate at-rest encryption independently from JWT signing.
   - Generation: `openssl rand -hex 32`.
   - Minimum length 16 chars; the helper throws on shorter values.

3. **Logger redaction expansion.**
   - Deny list grows from `{password, token, secret, apiKey, authorization, cookie}` to also include `accessToken`, `refreshToken`, `clientSecret`, `authToken` (auth family) and `ssn`, `dob`/`dateOfBirth`, `creditCard`/`cardNumber`, `cvv`/`cvc`, `bankAccount`, `routingNumber`, `taxId`, `ein`, `driverLicense`/`driversLicense` (PII).
   - **Suffix rule:** any key ending in `_encrypted` (or just `encrypted`) is redacted unconditionally. Defense in depth — encrypted-at-rest values shouldn't appear in logs even though they're already opaque.
   - The walk is **recursive**: nested objects and arrays are traversed; circular references short-circuit to `[CIRCULAR]`.

4. **`.env.example` is the canonical env-var registry.**
   - Anything the code consults via `process.env.*` must be listed with a one-line comment. CI does not enforce this (yet); the convention is documented in CONVENTIONS.md.
   - Real secrets never live in `.env.example` or any tracked file. Local dev uses `.env.local` (gitignored); deploys use the platform's secret store (Vercel / Render / Netlify).

5. **Secret scanner shipped as a script, not wired.**
   - `scripts/scan-secrets.mjs` walks `git ls-files`, applies a small allow-list of credential-shape regexes (Stripe, AWS, JWT-shaped, DB conn strings with embedded creds, literal-assigned long strings), and prints `path:line: classification`. Exits 0 by default; `--strict` makes it exit 1 on any hit.
   - **Not wired to pre-commit or CI.** Ops decides whether to bolt it on. The handoff documents that as outstanding.

6. **Provider-config plaintext fallback is a one-way ratchet.**
   - Reads prefer `config_encrypted`; only fall back to `config` JSONB when encrypted is null.
   - Writes always seal + zero the legacy column.
   - Backfill is naturally driven by admin saves. A Phase-2 migration drops the legacy column once ops confirms.

---

## Decisions cast down (rejected)

- **A new crypto library.** Rejected — `server/utils/crypto.ts` already exists with AES-GCM and is battle-tested by MFA. Adding pgcrypto or a new wrapper would multiply surface for no gain.
- **Per-column encryption (split apiKey vs secretKey vs from).** Rejected — the JSONB blob is already a single unit; sealing the whole thing keeps the schema stable across new providers and means new fields don't need a column-add.
- **KMS / envelope encryption with a DEK-per-row.** Deferred to Phase 2. The threat model today is "stolen DB dump"; a single platform key is the right v1 trade-off. ADR-0024 §Future already tracks the KMS promotion path.
- **Rotating the existing MFA `secret_encrypted` envelopes.** Out of scope — MFA TOTP secrets are not at risk by the same threat model (they're already sealed by the same key derivation), and rotation is an ops decision that needs user re-enrollment planning.
- **Wiring the scanner to pre-commit.** Out of scope — ops decides whether to enforce on local commits, on CI, or both. The script is the unit; the wiring is the choice.

---

## Operational notes (read before deploy)

- **`BULWARK_ENCRYPTION_KEY` generation:** `openssl rand -hex 32`. Set in Vercel / Render project env. Keep it out of `.env.example` and any tracked file.
- **Rotation:** changing the key invalidates all sealed columns (`provider_configs.config_encrypted` + `user_mfa.secret_encrypted`). Plan: stand up a re-key job that decrypts with the old key and re-seals with the new, then flip the env var. Tracked as future work.
- **Migration `0011_sealed_provider.sql`** is additive (`ADD COLUMN IF NOT EXISTS`) and safe to run on populated DBs. Existing rows continue to read from `config` until the next admin save.

---

## Verification

- `tests/unit/logger-redaction.test.ts` — 7 tests covering auth family, PII family, `_encrypted` suffix rule, non-sensitive leave-alone, nested-object recursion, array walks, circular short-circuit.
- `tests/unit/crypto-blob.test.ts` — 4 tests covering JSON round-trip, IV uniqueness, null/empty handling, tamper detection.
- `tests/unit/logger.test.ts` — base level filtering + shape (extended for the new keys it always covered).
- `scripts/scan-secrets.mjs` — runs cleanly on the repo (one acceptable hit on `run-dev-real.ps1` for the dev-only DB password; the script is read-only and non-blocking).

---

## Surface (files touched)

| File | Change |
|---|---|
| `server/utils/crypto.ts` | Added `BULWARK_ENCRYPTION_KEY` env fallback + `encryptJsonBlob` / `decryptJsonBlob` helpers. |
| `server/utils/logger.ts` | Expanded `REDACT_KEYS`, added `_encrypted` suffix rule, made walk recursive with cycle guard. |
| `server/db/schema/provider_configs.ts` | Added `config_encrypted text` column + decisions block. |
| `server/db/migrations/0011_sealed_provider.sql` | New migration — additive column. |
| `server/db/migrations/meta/_journal.json` | Appended entry for `0011_sealed_provider`. |
| `server/services/provider-config.real.ts` | Seal on upsert; exported `unsealProviderConfig(row)` for adapter consumers. |
| `server/services/_providers/email.ts` | Decrypt via `unsealProviderConfig` instead of raw row.config. |
| `server/services/_providers/sms.ts` | Decrypt via `unsealProviderConfig` instead of raw row.config. |
| `.env.example` | Re-authored as the canonical env-var registry. |
| `scripts/scan-secrets.mjs` | New — read-only repo-wide secret regex sweep. |
| `tests/unit/logger-redaction.test.ts` | New — 7-case redaction matrix. |
| `tests/unit/crypto-blob.test.ts` | New — JSON blob round-trip + tamper tests. |
