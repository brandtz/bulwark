# ADR-0006 — Security baseline (CSRF, MFA policy, env guards, SAST)

- **Status:** Accepted (2026-06-30) · **Epic:** L07

## Context
The app relies on `SameSite=Lax` alone for CSRF, has no org MFA enforcement, no
test-enforced tenant coverage, scattered env guards, and no CI security scan. A stale
comment also mislabeled the (actually encrypted) MFA secret as plaintext.

## Decision
Adopt a launch security baseline:
- **CSRF**: double-submit token — a server middleware requires `X-CSRF-Token` matching a
  per-session cookie on all unsafe `/api/**` methods (webhooks + cron-bearer exempt).
- **MFA policy**: `org_settings.mfa_mode ∈ disabled|optional|required`; `required` forces
  enrolment before protected routes.
- **Tenant coverage**: a test enumerates every org-scoped method and proves cross-tenant
  calls throw; CI flags new methods missing `assertSameTenant`.
- **Env guards**: one boot-time `env-guard` fails closed in production on unsafe config.
- **CI**: dependency + static security scan; fail on high/critical.
- **CSP nonce** is an explicit **post-launch** follow-up (current headers retained).

## Consequences
- Closes the OWASP-relevant launch gaps; regressions are gated, not hoped against.

## Alternatives rejected
- Rely on SameSite alone (insufficient for same-site forgery). Per-user permission grants
  now (post-launch). Nonce-CSP now (large refactor; deferred, documented).
