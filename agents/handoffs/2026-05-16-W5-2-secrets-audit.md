# W5-2 — Secrets handling, encryption at rest, redaction

**Date:** 2026-05-16
**Slice:** W5-2 (Phase 1 hardening Wave 5 — secrets + at-rest sealing)
**Scope class:** Server/services + schema + logger. No `/demo/`, no `server/middleware/` (W5-1 owns), no top-level page edits.
**ADR:** [ADR-0036](../decisions/ADR-0036-secret-handling.md)

---

## TL;DR

- `provider_configs.config_encrypted` ships sealed at rest (AES-256-GCM). Legacy `config` JSONB column remains as backfill seam; new writes seal + zero the legacy column.
- Logger redaction expanded to 30+ keys (auth family + PII patterns) plus a `_encrypted` suffix rule; walk is now recursive with circular-ref guard.
- `.env.example` re-authored as the canonical registry of every env var the code reads. Verified `.gitignore` covers `.env*` (only `.env.example` is tracked).
- `BULWARK_ENCRYPTION_KEY` introduced as the preferred at-rest key source (falls back to `JWT_SECRET` so existing dev envs keep working).
- `scripts/scan-secrets.mjs` shipped as a non-blocking read-only sweep — pre-commit / CI wiring deferred to ops.
- **15 new unit tests** all green (`logger-redaction.test.ts` + `crypto-blob.test.ts` + extended `logger.test.ts`).

**Hardcoded-secret sweep verdict:** zero real-secret remediations needed. The only credential-shaped hits in tracked files are dev convenience (`run-dev-real.ps1` DB password, explicitly accepted by the task brief) and prose references in ADRs/handoffs.

---

## Task A — Hardcoded-secret sweep findings

| Path:Line | Pattern | Classification | Action |
|---|---|---|---|
| `run-dev-real.ps1:3` | `postgresql://bulwark:Blue1984@localhost:5432/...` | dev-convenience (explicit allow-list in task brief) | None. Documented; flagged for ops to rotate before any non-local exposure. |
| `scripts/list-tables.mjs:2` | `postgresql://bulwark:Blue1984@localhost:5432/...` | dev-convenience (untracked — `git ls-files` returns nothing for this path) | None. Local-only helper. |
| `.env.example:15` | `postgresql://bulwark_app:REPLACE_ME@localhost:5432/...` | docs / placeholder | None. Placeholder is the point. |
| `agents/decisions/ADR-0012-phase2-infrastructure.md:100` | conn-string in prose | docs | None. |
| `agents/epics/E11-backend-wiring.md:64` | conn-string in prose | docs | None. |
| `drizzle.config.ts:18` | `process.env.DATABASE_URL \|\| 'postgres://localhost/bulwark_dev'` | default placeholder, no creds | None. |

Searches run (via `git grep`):

- `(api[-_]?key|secret|token|password|auth)[\s]*[:=][\s]*['"][^'"]{12,}['"]` — 0 hits.
- `(apiKey|api_key|secret|token|password|authToken|accessKey)[\s]*[:=][\s]*['"][A-Za-z0-9_+/=-]{12,}['"]` — 0 hits.
- `sk_(test|live)_[A-Za-z0-9]{20,}` / `pk_(test|live)_[A-Za-z0-9]{20,}` — 0 hits in tracked files. (Stripe sandbox keys exist in `.env.local` per the comment block in that file; it is gitignored.)
- `postgres(ql)?://[^'"\s]+:[^'"\s]+@` — only the 1 hit in `run-dev-real.ps1` plus the placeholder in `.env.example`.
- Hardcoded admin emails / default passwords — only the `BulwarkDemo!1` literal in `scripts/db-seed.mjs` (acceptable per the task brief — dev seed only).

`.env.local` was inspected (not tracked); it contains real R2 + Stripe sandbox keys with a comment block warning ops they were caught by GitHub push protection in a prior dev session and should be treated as compromised. No change needed from W5-2 — that's an ops rotation task documented in the file's header.

---

## Task B — `.env` hygiene

- `.gitignore` already covers `.env`, `.env.*` with `!.env.example`. Verified `git ls-files | rg '\.env'` returns only `.env.example`.
- **`.env.example` rewritten** as the canonical registry. Diff summary:

  | Added | Existing | Removed |
  |---|---|---|
  | `BULWARK_VERSION`, `BULWARK_ENCRYPTION_KEY`, `BULWARK_ALLOW_PROD_SEED`, `BULWARK_LOG_LEVEL`, `BULWARK_CORS_ORIGINS`, `BULWARK_RATE_LIMIT_DISABLED`, `BULWARK_NOTIFICATIONS_DISABLED`, `BULWARK_PDF_STUB`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_URL` (the new R2_* family replaces the old `CLOUDFLARE_R2_*` names — that older trio was unused by the codebase) | `BULWARK_BACKEND`, `NUXT_SESSION_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `STRIPE_*` | `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_KEY`, `CLOUDFLARE_R2_SECRET` (unused by code; replaced by `R2_*` which the codebase actually reads via `server/jobs/r2.ts`) |

- Built the env-var list by grepping `process.env.[A-Z_][A-Z0-9_]+` across `{server,app,shared,scripts}/**`. Every hit either matches an entry in `.env.example` or is `NODE_ENV` / `CI` (Node-builtin, not declared).

---

## Task C — Runtime config split (`nuxt.config.ts`)

- `runtimeConfig.public` contains exactly two keys: `backend` (the `BULWARK_BACKEND` flag) and `appName` ('Bulwark'). Both safe.
- `runtimeConfig` (private) contains `sessionPassword`, `databaseUrl`, `jwtSecret`, and the cookie config. All correctly server-only.
- **No moves needed.** The split is already clean — flagged in the W5-2 brief as something to audit, and the audit confirms it. Did not touch `nuxt.config.ts` (security headers section is W5-1's territory and the runtimeConfig block was already correct).

---

## Task D — Provider config / webhook secret sealing

Schema audit of every column that could hold a third-party secret:

| Table.Column | Type today | Verdict |
|---|---|---|
| `provider_configs.config` (JSONB) | **Plaintext** — `apiKey`, `accessKey`, `secretKey`, `authToken`, etc. nested per provider | **Sealed in W5-2.** |
| `provider_configs.config_encrypted` (text) | **NEW — sealed AES-GCM envelope** | Added in `0011_sealed_provider.sql`. |
| `webhooks.secret_hash` (text) | sha256 of issue-once raw secret (never stored plaintext) | No change. Signing-key debt tracked in ADR-0022 §sec-debt. |
| `webhooks.secret_prefix` (text) | 12-char display prefix of the raw secret | No change. Not sensitive on its own. |
| `api_keys.secret_hash` (text) | bcrypt of raw issued key | No change. |
| `api_keys.prefix` (text) | leading chars of raw key for UI | No change. |
| `user_mfa.secret_encrypted` (text) | already AES-GCM sealed (ADR-0024) | No change — already covered. |
| `users.password_hash` (text) | bcrypt | No change. |
| `tenant_settings`, `integrations` | tables do not exist | N/A. |

### Changes shipped

- **Migration:** [`server/db/migrations/0011_sealed_provider.sql`](../../server/db/migrations/0011_sealed_provider.sql) — `ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS config_encrypted text;` (nullable, additive, safe on populated DBs). Journal entry appended (`meta/_journal.json` idx 11).
- **Schema TS:** [`server/db/schema/provider_configs.ts`](../../server/db/schema/provider_configs.ts) — added `configEncrypted: text('config_encrypted')` column with a refreshed decisions block.
- **Crypto helpers:** [`server/utils/crypto.ts`](../../server/utils/crypto.ts) — added `BULWARK_ENCRYPTION_KEY` env preference + `encryptJsonBlob` / `decryptJsonBlob` convenience pair for the JSONB blob case.
- **Service layer:**
  - [`server/services/provider-config.real.ts`](../../server/services/provider-config.real.ts) — `upsert` seals via `encryptJsonBlob(parsed)` and writes `config = {}` so plaintext never lands in new rows. New exported helper `unsealProviderConfig(row)` reads `config_encrypted` first, falls back to legacy `config` for pre-W5-2 rows, and logs (no payload) + degrades to `{}` on tamper.
  - [`server/services/_providers/email.ts`](../../server/services/_providers/email.ts) and [`server/services/_providers/sms.ts`](../../server/services/_providers/sms.ts) — both adapters call `unsealProviderConfig(row)` instead of dereferencing `row.config` directly. The adapter contract surface (`SendEmailInput` etc.) is unchanged.
- **No service code logs decrypted values.** Verified by inspection; the logger's `_encrypted` suffix rule is the defense-in-depth net even if a future refactor regresses.

### Snapshot debt

- `server/db/migrations/meta/0011_snapshot.json` is **NOT** generated. Drizzle-kit's snapshot is used by `drizzle-kit generate` to compute future migrations; it is **not** consulted by `drizzle-kit migrate` at runtime, which reads `_journal.json` + the `.sql` files. Migration application works as shipped. Next agent to run `drizzle-kit generate` will see a diff against `0010` and can regenerate the snapshot cleanly — documented as W5-2 carry-over.

---

## Task E — Logger redaction verification

[`server/utils/logger.ts`](../../server/utils/logger.ts) updated:

- **Deny list grew** from 7 → 35 keys (auth-credential family + PII patterns). Both camelCase and snake_case variants are covered (`apiKey` / `api_key`, `cardNumber` / `card_number`, etc).
- **Suffix rule:** any key whose lowercased name ends with `_encrypted` (or `encrypted`) is redacted unconditionally.
- **Recursive walk** with `WeakSet` cycle guard. Nested `{ request: { headers: { authorization: 'Bearer ...' } } }` is now redacted; circular references short-circuit to `[CIRCULAR]`.

Tests: [`tests/unit/logger-redaction.test.ts`](../../tests/unit/logger-redaction.test.ts) — 7 cases (auth family, PII family, `_encrypted` suffix, non-sensitive leave-alone, nested object recursion, array-of-object walk, circular short-circuit). [`tests/unit/logger.test.ts`](../../tests/unit/logger.test.ts) (the original level-filter / shape suite) still passes unchanged.

---

## Task F — Secret-scanning CI hint

[`scripts/scan-secrets.mjs`](../../scripts/scan-secrets.mjs) shipped:

- Walks `git ls-files`, skips `demo/` `boilerplate/` `tests/` `agents/` `docs/` `public/` `.github/`, common binary/markup extensions, files > 1 MB, and the scanner itself.
- 6 regex rules: Stripe live/test secrets + publishables, AWS access keys, JWT-shaped triplets, DB conn strings with embedded creds, generic literal-assigned long-string credentials.
- Prints one line per hit (`path:line: classification :: snippet`). Exits 0 by default; `--strict` makes hits non-zero.
- **Not wired** to pre-commit or CI. **Ops decision:** whether to add it as a pre-commit hook (`.husky/pre-commit`) or a GitHub Actions step (`.github/workflows/secret-scan.yml`). Tracked as outstanding.

Run on the repo as shipped: **1 hit** on `run-dev-real.ps1` (the dev-only DB password, explicitly accepted by the task brief).

---

## Task G — ADR + status

- ADR: [`agents/decisions/ADR-0036-secret-handling.md`](../decisions/ADR-0036-secret-handling.md).
- BUILD_STATUS: appended in the Active Story section.

---

## Constraint compliance

| Constraint | Verdict |
|---|---|
| No `/demo/` edits | ✅ |
| No `server/middleware/` edits | ✅ |
| No `nuxt.config.ts` security-headers edits | ✅ (no edits at all) |
| No npm deps added | ✅ (Node built-ins only; reused `server/utils/crypto.ts`) |
| Migration ID is `0011_*` | ✅ (`0011_sealed_provider.sql`) |
| All new files ≥ 40 LOC carry ADR-0008 rich-comment headers | ✅ (`crypto-blob.test.ts`, `logger-redaction.test.ts`, `scan-secrets.mjs`, `ADR-0036`, migration SQL all have decisions/header blocks) |

---

## Quality gates

- **Unit tests (mine):** ✅ 15 / 15 passing across `tests/unit/{logger,logger-redaction,crypto-blob}.test.ts`.
- **Unit tests (full suite):** ⚠️ 324 / 326 passing — 2 failing tests and 1 collection error are **pre-existing W5-1 work-in-progress** and were not introduced by W5-2:
  - `tests/unit/safe-url.test.ts` — fails to load (`~~/app/utils/safeUrl` missing). Same root cause as the BulwarkAvatar `safeUrl` typecheck errors below.
  - `tests/unit/account-export.test.ts` — `AccountExportSchema.safeParse` failing on the personal-data export shape.
  - `tests/unit/labels.test.ts` — `legal.privacy.title` key has no matching `LabelNamespace`.

  None of these touch files modified by W5-2. They appear to be transient artifacts of W5-1's account-export + privacy-page slice being mid-flight; verify with W5-1 owner.

- **Typecheck (`pnpm exec vue-tsc --noEmit`):** ⚠️ exit 2 with 13 errors, **all pre-existing** (not introduced by W5-2):
  - 9× `app/components/ui/BulwarkAvatar.vue` + `app/pages/admin/properties/.../*` + `app/pages/field/.../*` + `app/pages/settings/branding.vue` — all referencing a missing `safeUrl` helper on the Vue template scope. Same W5-1 work-in-progress as the unit-test failure above.
  - 1× `server/middleware/01.rate-limit.ts:74` — number/string mismatch. **Off-limits to W5-2** (`server/middleware/` is W5-1's territory).
  - 1× `server/services/account.real.ts:88` — declared-but-unused `tenantResolver` (W5-1).
  - 1× `server/services/auth.real.ts:282` — `input` referenced outside its scope (W5-1).

  W5-2's own files (`crypto.ts`, `logger.ts`, `provider_configs.ts`, `provider-config.real.ts`, `_providers/email.ts`, `_providers/sms.ts`, the two new test files) all typecheck clean. The unit-test compiler is happy with them too — vitest's loader ran them without complaint.

**Net:** W5-2 ships behind a yellow build because W5-1 is mid-flight on the same branch. The W5-2 surface itself is green.

---

## Operational follow-ups for ops / next agent

1. **Generate `BULWARK_ENCRYPTION_KEY` for staging + prod:** `openssl rand -hex 32`. Paste into Vercel/Render project env. Keep it out of `.env.example` and any tracked file. If you skip this step the platform falls back to `JWT_SECRET`, which works but couples at-rest rotation to JWT rotation — not ideal long-term.
2. **Rotate the keys in `.env.local`:** the file's own comment block flags the Stripe sandbox keys as compromised (caught by GitHub push protection in a prior session). R2 access key + secret should also be rotated as a precaution.
3. **Rotate `run-dev-real.ps1`'s DB password:** the `Blue1984` string is acceptable for local dev but is tracked. Move it to `$env:DATABASE_URL = $env:DATABASE_URL` reading from `.env.local`, or rotate the local DB role.
4. **Decide on the secret scanner's CI/pre-commit wiring.** The script is ready; the choice is ops policy.
5. **Backfill existing `provider_configs` rows** (if any) by saving each provider config through the admin UI once. Or wire a one-shot `scripts/seal-provider-configs.mjs` that reads → seals → writes; tracked but not shipped.
6. **W5-1 mid-flight fixes** — owner should land the `safeUrl` helper + the auth.real/account.real/rate-limit fixes to restore exit 0 on typecheck.

---

## Files touched

| Path | Status |
|---|---|
| `server/utils/crypto.ts` | modified |
| `server/utils/logger.ts` | modified |
| `server/db/schema/provider_configs.ts` | modified |
| `server/db/migrations/0011_sealed_provider.sql` | new |
| `server/db/migrations/meta/_journal.json` | modified |
| `server/services/provider-config.real.ts` | modified |
| `server/services/_providers/email.ts` | modified |
| `server/services/_providers/sms.ts` | modified |
| `.env.example` | rewritten |
| `scripts/scan-secrets.mjs` | new |
| `tests/unit/logger-redaction.test.ts` | new |
| `tests/unit/crypto-blob.test.ts` | new |
| `agents/decisions/ADR-0036-secret-handling.md` | new |
| `agents/handoffs/2026-05-16-W5-2-secrets-audit.md` | new (this file) |
| `BUILD_STATUS.md` | appended |
