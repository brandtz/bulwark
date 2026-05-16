# Handoff — W5-1 API security hardening (2026-05-16)

**Slice:** W5-1 / EH-R
**ADRs:** [ADR-0035](../decisions/ADR-0035-api-security-hardening.md)
(builds on ADR-0023 lockout, ADR-0034 observability)
**Status:** Shipped. Three new middleware, three new utils, three
new unit-test files, one new ADR. Typecheck = pre-existing single
error in `server/services/account.real.ts` (untracked file, W5-3
scope). Full unit suite = 57 of 60 files passing, 3 pre-existing
failures unchanged.

## What shipped

### Pure helpers (utils)

- [server/utils/rate-limit.ts](../../server/utils/rate-limit.ts) —
  rule registry, fixed-window evaluator, `BucketStore` interface,
  `__resetRateLimitForTests` test hook, `pickEmailFromBody` body
  sniffer. The Redis-swap hook is the `storage` const at the top of
  the file: replace with an ioredis-backed implementation of the
  same three-method interface.
- [server/utils/security-headers.ts](../../server/utils/security-headers.ts) —
  `buildSecurityHeaders({ isHtml, env? })`, `buildCspValue`,
  `CSP_DIRECTIVES`, `isHtmlPath`.
- [server/utils/cors.ts](../../server/utils/cors.ts) —
  `parseAllowlist`, `decideCors`.

### Middleware (Nitro auto-loaded, numerically ordered)

- [server/middleware/01.rate-limit.ts](../../server/middleware/01.rate-limit.ts) —
  reads IP / body, calls `evaluateRateLimit`, emits 429 +
  `Retry-After` + log + metric on block.
- [server/middleware/02.security-headers.ts](../../server/middleware/02.security-headers.ts) —
  applies headers from the pure builder.
- [server/middleware/03.cors.ts](../../server/middleware/03.cors.ts) —
  allowlist echo + OPTIONS short-circuit.

### Metrics

- `server/utils/metrics.ts` — added `COUNTERS.rateLimitBlocksTotal`
  (`rate_limit_blocks_total`). Seeded to 0 at module load like the
  other counters.

### Tests (all passing, +31 total)

- [tests/unit/rate-limit.test.ts](../../tests/unit/rate-limit.test.ts) — 10
  tests (bypass, global default, per-route IP, per-email, retry-after,
  rule registry sanity, metrics counter wiring).
- [tests/unit/security-headers.test.ts](../../tests/unit/security-headers.test.ts) —
  13 tests (always-on baseline × 5, HSTS gating × 3, CSP gating × 5).
- [tests/unit/cors.test.ts](../../tests/unit/cors.test.ts) — 8 tests
  (allowlist parsing × 2, same-origin default × 2, allowlist echo × 2,
  OPTIONS preflight × 2).

### ADR

- [agents/decisions/ADR-0035-api-security-hardening.md](../decisions/ADR-0035-api-security-hardening.md)

## Env contract

| Var | Default | Purpose |
|---|---|---|
| `BULWARK_RATE_LIMIT_DISABLED` | unset | When `1`, every rate-limit check is a no-op. Set by Playwright + dev. |
| `BULWARK_RATE_LIMIT_TRUST_PROXY` | unset | When `1`, read first hop of `x-forwarded-for`; otherwise socket address only. |
| `BULWARK_FORCE_HSTS` | unset | When `1`, emit HSTS in non-prod (Render preview, staging). |
| `BULWARK_CSP_REPORT_ONLY` | unset | When `1`, emit `Content-Security-Policy-Report-Only` instead of the enforcing header. |
| `BULWARK_CORS_ORIGINS` | unset | Comma-separated origin allowlist. Unset = same-origin only (no `Access-Control-Allow-Origin` header). |

**Ops checklist for production:**

1. Leave `BULWARK_RATE_LIMIT_DISABLED` UNSET. (Setting it disables
   the throttle entirely.)
2. Set `BULWARK_RATE_LIMIT_TRUST_PROXY=1` on Render/Vercel/Netlify
   (all three terminate TLS and inject `x-forwarded-for`).
3. `NODE_ENV=production` auto-enables HSTS; no need to set
   `BULWARK_FORCE_HSTS`.
4. Leave `BULWARK_CORS_ORIGINS` UNSET — the launch posture is
   same-origin.
5. Leave `BULWARK_CSP_REPORT_ONLY` UNSET — the Phase 1 policy is
   enforce-mode from day one.

## Test count delta

- Pre-W5-1 (W4-3 sweep baseline): 242 tests across 43 files.
- Post-W5-1 measured run: 326 tests across 60 files (3 files /
  files fail pre-existing — see Deviations).
- W5-1 contribution: **+3 files, +31 tests** (rate-limit ×10,
  security-headers ×13, cors ×8). The brief estimated "~3"; the
  extra 28 are tighter sub-assertions in the same three files.

## Hard-constraint check

| Constraint | Outcome |
|---|---|
| Do not touch `/demo/` | ✅ no edits |
| Do not modify `server/utils/logger.ts` | ✅ unchanged |
| Do not modify `server/services/*.real.ts` | ✅ no edits |
| No new npm deps | ✅ no `package.json` change |
| Append-only barrel edits | ✅ middleware needs no barrel; metrics added one COUNTERS key |
| Rich-comment headers on new files ≥40 LOC | ✅ all six new source files carry an ADR-0008 header |
| Filename prefixes `01`/`02`/`03` for ordering | ✅ |
| Re-running middleware is idempotent | ✅ all three are pure-by-construction (no module-scope side-effect beyond a `Map` that test code resets) |
| `pnpm exec vitest run tests/unit` passes | ⚠ 3 pre-existing failures unchanged; see Deviations |
| `pnpm exec vue-tsc --noEmit` exit 0 | ⚠ 1 pre-existing error in untracked `account.real.ts`; see Deviations |

## Deviations

1. **Typecheck exit 2, single error**
   `server/services/account.real.ts(88,32): error TS6138: Property
   'tenantResolver' is declared but its value is never read.`
   The file is **untracked** (`git status --short` → `?? server/services/account.real.ts`),
   so it post-dates the last commit but pre-dates this slice. The
   W5-1 brief forbids editing `*.real.ts` (W5-3 scope), so the
   error is left in place. Once W5-3 lands the service-layer
   audit, the unused parameter should drop. W5-1 introduced **zero
   new** typecheck errors.

2. **Three pre-existing unit-test failures unchanged**
   - `tests/unit/labels.test.ts` — `legal.privacy.title` is not in
     `LabelNamespaceSchema`; either the label key or the schema
     enum needs to grow a `legal` member. Not in scope (W1-2
     contract surface).
   - `tests/unit/account-export.test.ts` — `MockAccountService
     .exportPersonalData` no longer validates against
     `AccountExportSchema`. Untracked test/file pair; same root
     cause as the typecheck error.
   - `tests/unit/safe-url.test.ts` — imports `~~/app/utils/safeUrl`
     which doesn't exist. Untracked test file; companion
     implementation missing.
   None of these touch the W5-1 surface; the three new test files
   all pass cleanly.

3. **Rate-limit middleware reads body in-line**
   The middleware calls `readBody(event)` when a matched rule has
   a `perEmail` cap. h3 caches the parsed body on the event so the
   downstream dispatcher's own `readBody` returns the same object —
   verified by inspection of the dispatcher's
   `[service]/[method].post.ts`. Should `readBody` semantics change
   in a future h3 major, this contract needs a re-check.

## Known debt (carried into W5-2 / Phase 2)

1. **No CSP-report ingestion endpoint.** Setting
   `BULWARK_CSP_REPORT_ONLY=1` produces violation reports but
   nothing consumes them. Add `POST /api/csp-report` alongside the
   W5-2 logging-ingest work.
2. **Nonce-based CSP** lifted to Phase 2 — needs an SSR helper for
   per-request nonces.
3. **Multi-instance rate-limit consistency** depends on the future
   ioredis adapter. The `BucketStore` interface in
   `server/utils/rate-limit.ts` is the single replacement point.
4. **No "force-unlock" admin action** (already in ADR-0023 debt).
5. **`X-CSRF-Token` is whitelisted in CORS Allow-Headers** in
   anticipation of a future token check on credentialed cross-
   origin POSTs. No server-side validator exists yet — the header
   is harmless until a route consults it.

## Verifier commands

```pwsh
# new tests
cd d:\bulwark\bulwark
pnpm exec vitest run tests/unit/rate-limit.test.ts tests/unit/security-headers.test.ts tests/unit/cors.test.ts
# expected: Test Files 3 passed (3), Tests 31 passed (31), exit 0

# typecheck (one pre-existing error in account.real.ts, unrelated)
pnpm exec vue-tsc --noEmit --pretty false

# full unit (3 pre-existing failures unrelated to W5-1)
pnpm exec vitest run tests/unit
```

## Hooks for downstream work

- W5-2 (logging ingest): add `POST /api/csp-report` next to the
  CSP-report-only flag.
- W5-3 (service-layer audit): fix the unused `tenantResolver` and
  audit-export schema drift; the missing `safeUrl` companion;
  patch labels namespace for `legal.*`.
- Phase 2 (horizontal scale): swap `BucketStore` in
  `server/utils/rate-limit.ts` for an ioredis-backed
  implementation; nothing else needs to move.
- Phase 2 (nonce CSP): write an SSR nonce helper and lift the
  `'unsafe-inline'` directive in `CSP_DIRECTIVES`.
