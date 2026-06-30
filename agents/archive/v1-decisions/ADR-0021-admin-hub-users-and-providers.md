# ADR-0021 — Admin hub (users + providers + audit) for W2-4 / EH-H Part B

## Status

Accepted — 2026-05-15.

## Context

Wave 2 hardening (EH-H Part B) calls for finishing the **Admin hub**:

- A real users + invites surface (the v1 page only listed fixture users).
- A providers configuration surface for email / SMS / storage / PDF.
- A filterable + CSV-exportable audit-log surface.
- Per-user notification preferences (drives in-app, email, SMS).

The work spans three contracts (`user`, `provider-config`,
`notification-subscription`, plus filter extensions to `audit`) and six
admin/profile pages. Three implementation questions had to land first.

## Decisions

### 1. Status derivation — single source of truth

`UserAdminRow.status` is **never persisted**. It is derived from two
boolean flags:

| `users.is_active` | `memberships.is_active` | `status`      |
|-------------------|-------------------------|----------------|
| `true`            | `true`                  | `active`       |
| `true`            | `false`                 | `suspended`    |
| `false`           | `*`                     | `deactivated`  |
| n/a (no user yet) | n/a (pending row only)  | `invited`      |

Persisting a status column would have created drift between the column
and the booleans. The shared helper `deriveStatus()` is exposed from the
contract so the mock and real implementations agree.

### 2. Invite tokens — dual-token transition

The real backend uses an opaque random hex token: the user-admin UI
mints `randomBytes(32).hex` and stores `sha256(token)` in the
`pending_invites` table. The raw token is returned **exactly once** in
the `inviteUrl` field and is shown ONCE in a yellow banner in the UI.

The mock backend keeps minting JWT-style base64url payload tokens so
the existing `MockAuthService.acceptInvite` continues to work without
a parallel `pending_invites` store.

`RealAuthService.acceptInvite` checks `pending_invites` first
(`hashInviteToken()` → table lookup), then falls back to the legacy
JWT path. Once the legacy invites are gone (Phase 2), the fallback
can be removed.

### 3. Provider config — Zod per kind

Each provider kind (`email`, `sms`, `storage`, `pdf`) has its own union
of `provider` values and its own Zod for the `config` JSON. The
service's `upsert()` calls `PROVIDER_CONFIG_ZOD[provider].parse(config)`
before writing — bad shape is a 400 at the service boundary, not at the
controller. Adding a new provider is a one-line addition to
`PROVIDERS_BY_KIND` plus a Zod entry.

## Rejected alternatives

- **A `users.status` column.** Drift risk; we already have the two
  booleans.
- **Persisting `pending_invites` rows in the mock too.** Doubles the
  invite surface for no benefit in v1 — the mock store survives the
  whole session and a per-row token round-trip works fine through the
  JWT-style payload.
- **A single global "provider settings" JSON blob.** Conflicts with the
  per-kind activation model (you can have a primary email provider and
  a fallback) and makes the per-kind Zod awkward.

## Known debt

- **Secret storage**: provider configs and webhook secrets are stored
  unsealed in `provider_configs.config` and `webhooks.secret_hash`.
  Phase 1 risk. W3-1 will introduce a sealed-secret column backed by a
  KMS.
- **Notification delivery**: this slice exposes preferences and seeds
  defaults, but actually *sending* the notifications is W3-1.
