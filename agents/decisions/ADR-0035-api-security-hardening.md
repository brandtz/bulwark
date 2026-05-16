# ADR-0035 — API security hardening (W5-1 / EH-R)

## Status

Accepted — 2026-05-16.

## Context

Wave 5 hardening (EH-R) closes the public-surface gaps surfaced by
the W4-3 regression sweep: rate-limit middleware (the missing half
of ADR-0023), security response headers, a default-deny CORS policy,
a Content-Security-Policy baseline, and a read-only CSRF audit. None
of these existed in source on 2026-05-16; ADR-0023 had explicitly
deferred the route-layer half to this slice.

The constraint was that **no new runtime dependency** could land —
in particular no `helmet` and no `ioredis`. The decisions below all
fall out of that constraint plus the fact that Phase 1 hosts a
single Nitro instance behind a single origin.

## Decisions

### 1. In-memory token-bucket rate limiter, with a Redis-swap hook

`server/utils/rate-limit.ts` carries the policy (rule registry +
pure evaluator); `server/middleware/01.rate-limit.ts` is a thin h3
wrapper that reads IP / body and emits 429 with `Retry-After` on
block. Storage is a `Map<string, { count, resetAt }>` wrapped in a
narrow `BucketStore` interface so a future swap to ioredis is a
one-file change. Fixed-window over 60 s; ADR-0023 already documents
why per-IP is the right axis and why per-email is layered on top
for `/login` + `/forgot-password`.

Rules at v1:

| Route pattern (regex)                                            | Method | Per-IP   | Per-email |
|------------------------------------------------------------------|--------|----------|-----------|
| `/api/(services/)?auth/login`                                    | POST   | 10/min   | 5/min     |
| `/api/(services/)?auth/(acceptInvite\|accept-invite)`            | POST   | 5/min    | —         |
| `/api/(services/)?auth/(requestPasswordReset\|forgot-password)`  | POST   | 5/min    | 3/min     |
| `/api/(services/)?auth/...` (catch-all)                          | POST   | 20/min   | —         |
| anything else                                                    | any    | 60/min   | —         |

The dispatcher path `/api/services/auth/<method>` is the real shape
in this codebase; the documented `/api/auth/<verb>` form is matched
too so the rules survive any future direct-route refactor.

Env contract:

- `BULWARK_RATE_LIMIT_DISABLED=1` — short-circuits the middleware
  before bookkeeping. Used by Playwright + dev fixtures.
- `BULWARK_RATE_LIMIT_TRUST_PROXY=1` — read the first hop of
  `x-forwarded-for`. Without it we never trust the header.

Block side-effects: `log('warn', 'security.rate_limited', { … })`
plus `incCounter(COUNTERS.rateLimitBlocksTotal)`.

### 2. Bespoke security headers (no `helmet`)

`server/utils/security-headers.ts` is a pure builder; the
`02.security-headers.ts` middleware applies the result with
`setResponseHeaders`. Always-on headers:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), interest-cohort=()`
- `X-DNS-Prefetch-Control: off`

Gated:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  only when `NODE_ENV=production` OR `BULWARK_FORCE_HSTS=1`. Dev /
  Playwright on `http://localhost` would otherwise pin the browser
  to HTTPS for two years.

CSP (HTML paths only — `/api/*`, `/_nuxt/*`, and static-extension
URLs are skipped):

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self';
font-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

`BULWARK_CSP_REPORT_ONLY=1` flips the header name to
`Content-Security-Policy-Report-Only` so a staging environment can
tighten the policy without breaking real users.

### 3. CORS — same-origin default, env-driven allowlist

`server/utils/cors.ts` (pure decider) + `03.cors.ts` (h3 wrapper).
Behaviour:

- `BULWARK_CORS_ORIGINS` unset → no `Access-Control-Allow-Origin`.
  OPTIONS requests carrying an `Origin` get a clean 204 so we don't
  404 cross-origin preflights.
- `BULWARK_CORS_ORIGINS="https://a,https://b"` → echo the matched
  `Origin` (never `*`), set `Allow-Credentials: true`,
  `Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`,
  `Allow-Headers: Content-Type, Authorization, X-CSRF-Token`, plus
  `Vary: Origin`. OPTIONS preflights are short-circuited to 204
  with the same headers.
- Phase 1 = same-origin only; the allowlist exists for the
  forthcoming mobile-native / SDK use case.

### 4. Body-size limits — accept Nitro default

Nitro's `readBody` default cap is 1 MiB. The current API surface
has no upload route — file ingest goes through pre-signed S3 URLs
issued by the provider-config service. No `routeRules` override
was added; if a future direct-upload route lands it can opt up via
`nuxt.config.ts → nitro.routeRules['/api/files/*'].body.maxSize`.

### 5. CSRF posture (read-only audit)

Findings:

- **Session cookie** (`nuxt-auth-utils`) is configured in
  `nuxt.config.ts → runtimeConfig.session.cookie` with
  `httpOnly: true`, `secure: NODE_ENV === 'production'`,
  `sameSite: 'lax'`. `Lax` blocks cross-origin `fetch` POSTs but
  permits top-level form navigations — which we do not consume.
  Acceptable for Phase 1.
- **No Bearer-token API surface**. The RPC dispatcher
  (`/api/services/[service]/[method].post.ts`) is reachable only
  with a valid session cookie that the service-layer firewall then
  rejects if the tenant resolver returns null. JWTs in the codebase
  are confined to (a) password-reset + invite tokens consumed by
  unauthenticated POSTs that the rate-limit middleware now caps,
  and (b) the pre-MFA `mfaToken` flow (ADR-0024) which is itself a
  single use.
- **No state-changing GETs** in `server/api/`. Every POST/PUT/
  PATCH/DELETE either lives behind the RPC dispatcher (cookie
  auth) or is one of the public auth verbs already covered by the
  rate-limit rules.

Conclusion: existing cookie config + same-origin posture cover the
CSRF surface at Phase 1. No code change required. Re-evaluate when
the mobile-native client lands and we introduce Bearer-token API
auth.

## Rejected alternatives

- **`helmet`** — pulls a runtime dep and several modules we'd
  immediately override (no XSS-Protection, no DNS-prefetch tweak in
  helmet's default). Eight headers by hand is cheaper.
- **`ioredis` for shared rate-limit state** — single-instance
  Phase 1 hosting; ADR-0035 §1 leaves a `BucketStore` interface so
  this is a one-file swap when Phase 2 introduces horizontal scale.
- **Nonce-based CSP** — Nuxt SSR makes per-request nonces awkward
  (each `<script>` tag the renderer emits would need to be
  re-decorated). `'unsafe-inline'` is the documented Phase 1 floor;
  Phase 2 hardens to a nonce strategy once the SSR helper exists.
- **`Access-Control-Allow-Origin: *`** — the spec already rejects
  it for credentialed requests; an env-driven allowlist is the
  only safe shape.
- **Per-org rate-limit overrides** — pre-auth requests don't yet
  know the org; ADR-0023 already documents this.

## Known debt

- **Per-process bucket store**. If we add a second Nitro instance
  before Phase 2, an attacker can effectively double their cap by
  round-robining between instances. Mitigate by sticky sessions at
  the LB layer until ioredis lands.
- **`'unsafe-inline'` in CSP**. Documented above; nonce upgrade is
  Phase 2.
- **No CSP violation reporter endpoint**. Adding
  `BULWARK_CSP_REPORT_ONLY=1` produces report-only output but
  there's no `/api/csp-report` ingester. Defer to W5-2 (logging
  ingest) — the same endpoint can land both.
- **`account.real.ts` carries an unread `tenantResolver`** flagged
  by `vue-tsc`. Out of W5-1 scope (W5-3 owns service-layer audit);
  not introduced by this slice but blocks the "exit 0 typecheck"
  gate. See the W5-1 handoff §Deviations.
