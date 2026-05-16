# Handoff — W2-5 Auth Hardening (2026-05-15)

**Slice:** W2-5 / EH-D
**ADRs:** [ADR-0023](../decisions/ADR-0023-auth-lockout-and-rate-limit.md),
[ADR-0024](../decisions/ADR-0024-totp-mfa.md),
[ADR-0025](../decisions/ADR-0025-permission-overrides.md)
**Status:** Server complete; rate-limit middleware + permissions matrix UI deferred (see Known Debt)

## What shipped

### Schemas (in barrel)
- `auth_attempts` — per-attempt log (email, ip, ua, success, timestamps).
- `user_mfa` — per-user TOTP secret (`secret_encrypted` AES-GCM via `server/utils/crypto.ts`), confirmed flag, confirmedAt.
- `mfa_backup_codes` — sha256-hex single-use codes, consumedAt.
- `permissions` — per-(org, role, permissionKey) override row; `granted: bool`; org-nullable for future platform-global overrides.

### Contracts + services
- `shared/contracts/mfa.ts` — `IMfaService { setup, confirm, verify, disable, generateBackupCodes, consumeBackupCode }`.
- `shared/contracts/permission.ts` — `IPermissionService { listForOrg, upsert, bulkUpsert, resetToDefaults, getEffectivePermissions(role, orgId) }`.
- `auth.real.ts` extended with lockout enforcement:
  - Constants: `LOCKOUT_THRESHOLD=5`, `LOCKOUT_WINDOW_MS=15min`, `LOCKOUT_DURATION_MS=30min`.
  - Every login attempt writes an `auth_attempts` row.
  - On threshold breach: returns `{ error: 'account_locked', retryAfter }`.
  - Audit: `security.account_locked`, `security.login`, `security.logout`.
- `mfa.real.ts` — TOTP via `otpauth@^9.5.1`, QR data URL via `qrcode@^1.5.4`. Setup → confirm → verify three-verb flow. Pre-MFA `mfaToken` JWT with 5-minute TTL.
- `permission.real.ts` — static-defaults + DB-overrides merge in `getEffectivePermissions`.

### Wiring
- `BulwarkServices` gains `mfa`, `permission`.
- Mocks + real wired through both factories.
- New audit kinds: `security.account_locked`, `security.mfa_enabled`, `security.mfa_disabled`, `security.backup_code_consumed`, `security.invite_accepted`.

### Tests
Unit coverage lives in:
- Auth lockout flow inside the broader auth integration suite.
- MFA setup/confirm/verify/backup-code paths.
- Permission merge logic.

## Known debt (carried into Wave 5)

1. **Rate-limit middleware** — `BULWARK_RATE_LIMIT_DISABLED` flag was specified in the brief and documented in ADR-0023, but the actual per-IP throttle middleware on `/api/auth/login` and `/api/auth/accept-invite` is NOT yet in source. The lockout half of the brief IS implemented and is the stronger control; rate-limit middleware belongs to the Wave 5 security hardening pass.
2. **`/settings/permissions` matrix UI** — `IPermissionService` is live and the dispatcher merges effective permissions, but the admin matrix UI (rows = permission keys, columns = roles, checkboxes per cell) is not yet built. Service + contract are stable so it's a presentation-only follow-up.
3. **Schema comment in `mfa_backup_codes`** — comment claims bcrypt but implementation is sha256-hex (correct for high-entropy single-use tokens per ADR-0024). Leaving the schema sealed; the ADR overrides the stale comment.
4. **Login page UI changes** — handling of `account_locked` (retryAfter banner) and `requiresMfa: true` (code input + backup-code link) responses needs UI wiring on `app/pages/login.vue` if not already present from W2-4.
5. **Profile MFA setup page** at `app/pages/profile/security.vue` — needs enroll/disable/regenerate-backup-codes UI.

## Hooks for downstream work

- Wave 5 security hardening should ship the rate-limit middleware (Express-style limiter against in-memory or Redis backing store), then layer Helmet-style security headers, CSRF coverage audit, and a CSP.
- Permissions matrix UI is a small admin-surface slice; can be bundled with any "settings polish" pass.
- The `mfaToken` JWT path is in place — the login page handler just needs to branch on `requiresMfa` + render the second-factor input.
