# ADR-0023 — Auth lockout + per-IP rate limit (W2-5 / EH-I)

## Status

Accepted — 2026-05-15.

## Context

Wave 2 hardening (EH-I) closes the long-standing Phase 1 gap that
`POST /api/auth/login` and `POST /api/auth/accept-invite` were
unmetered. Two distinct attack surfaces had to land in the same slice
because they share a single pre-auth telemetry channel
(`auth_attempts`):

- **Slow credential-stuffing** against a known email. A patient
  attacker pacing 1 attempt/30s would never trip per-IP throttles but
  would still chew through the password space.
- **Burst attacks** from a single IP (script kiddie, scanner) against
  a wide range of emails. Per-email lockout doesn't help because the
  attacker rotates emails.

The shape decided below splits responsibility: per-email **lockout**
in the service layer, per-IP **rate limit** in the route layer.

## Decisions

### 1. `auth_attempts` is the single source of truth for lockout

[server/db/schema/auth_attempts.ts](../../server/db/schema/auth_attempts.ts)
captures every login attempt (success **and** failure) with `email`
(lowercased), `ipAddress`, `success`, optional `reason`, and
`occurredAt`. Two indexes — `(email, occurredAt)` and
`(ip_address, occurredAt)` — keep both the lockout count and any
future per-IP analytics fast.

Reasons recorded today (free-text, not enum-constrained):
`bad_password`, `unknown_user`, `inactive`, `locked`, `mfa_required`
(waypoint, see §3), `mfa_bad_code`, `mfa_totp`, `mfa_backup`.

The table is **NOT tenant-scoped**. Login happens before we know the
user's org, and a single email may legitimately exist in multiple
orgs. The post-auth `audit_log` row carries the `organization_id`
once the session is built.

### 2. Lockout policy: 5 failures in 15 minutes → 30-minute lockout

Encoded as module-level constants in
[server/services/auth.real.ts](../../server/services/auth.real.ts)
(~line 85):

```ts
const LOCKOUT_THRESHOLD   = 5
const LOCKOUT_WINDOW_MS   = 15 * 60 * 1000
const LOCKOUT_DURATION_MS = 30 * 60 * 1000
```

`RealAuthService.getLockoutState({ email })` scans `auth_attempts`
inside `LOCKOUT_WINDOW_MS` and counts **consecutive** failures from
most-recent backwards until a success breaks the streak. If
`failures >= LOCKOUT_THRESHOLD`, the account is locked until
`lastFailureAt + LOCKOUT_DURATION_MS`.

A locked attempt is itself recorded as `reason: 'locked'` and throws
an `account_locked` error carrying `retryAfterSeconds` so the
controller can surface a friendly retry hint.

### 3. `mfa_required` is a counting waypoint, not a failure

When password verification succeeds but MFA is enabled, the service
writes a `success=false, reason='mfa_required'` row and returns an
opaque `mfaToken` instead of a session. The lockout counter
**skips** rows whose `reason='mfa_required'` (the password was
correct — the user just hasn't completed step-up). This prevents a
legitimate "forgot my phone, tried login 6 times" from triggering a
30-minute self-DoS while still requiring MFA before session issue.

### 4. Per-org overrides via `org_settings`

Three keys are reserved in `org_settings` for post-identification
re-evaluation:

- `auth.lockoutThreshold` (default 5)
- `auth.lockoutWindowMinutes` (default 15)
- `auth.lockoutDurationMinutes` (default 30)

The **pre-auth** count uses the global defaults (we don't know the
org yet). Once the user is identified, future hardening can re-check
against the org's policy before issuing the session. v1 ships with
the global defaults active.

### 5. Per-IP rate limit on auth routes

`POST /api/auth/login` and `POST /api/auth/accept-invite` are
throttled at **10 requests / minute per IP**, returning **HTTP 429**
with a `Retry-After` header carrying the seconds until the bucket
refills. The limit is decoupled from the lockout counter — it is a
DoS shield, not a credential-stuffing brake.

Source IP is read from `x-forwarded-for` first hop, falling back to
the socket address. Behind a misconfigured proxy this is spoofable;
the audit log + lockout count are the second line of defence.

### 6. `BULWARK_RATE_LIMIT_DISABLED=1` escape hatch

Setting the env var to `1` short-circuits the rate-limit middleware
to a no-op. This is the documented opt-out for:

- Playwright suites that hammer `/api/auth/login` faster than 10/min
  while exercising the happy-path tour.
- Local dev where the developer is rotating fixtures.

The escape hatch is **never** consulted by the in-service lockout
check — that remains live regardless. So a misconfigured env still
locks out a misbehaving fixture rather than letting it run wild.

## Rejected alternatives

- **Token-bucket per email**. Would block legitimate users behind a
  shared IP (corporate NAT, classroom). Per-IP is the right axis for
  the burst case.
- **Persisting lockout state in a dedicated `auth_lockouts` table**.
  Adds a write per login attempt for no gain — the consecutive-failure
  scan over the indexed `auth_attempts` table is fast enough and
  there's no second source of truth to drift.
- **Capping every API route at 10/min**. Too aggressive for authed
  surfaces (the admin hub does multiple parallel reads on page load).
  Limit is scoped to the unauthenticated entry points.
- **Returning 401 for a locked account.** Indistinguishable from a
  bad password; the operator UI can't tell the user to wait 30 min.
  We surface a distinct `account_locked` error + `retryAfterSeconds`.

## Known debt

- **No CAPTCHA**. A determined attacker with a rotating IP pool will
  still trickle through. CAPTCHA + adaptive risk scoring are Phase 2.
- **Per-org overrides not enforced pre-auth.** Cannot be without
  leaking org membership through the lockout response timing.
  Acceptable for v1.
- **No admin UI to unlock**. Today an op must clear `auth_attempts`
  rows directly or wait out the 30 minutes. A `Force unlock` action
  on `/settings/users` is a Phase 2 cleanup.
- **`Retry-After` header from the rate-limiter is whole-second
  precision**. Sub-second precision is unnecessary at 10/min and
  HTTP/1.1 spec only defines integer seconds anyway.
