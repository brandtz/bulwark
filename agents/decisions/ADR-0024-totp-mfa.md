# ADR-0024 — TOTP multi-factor authentication (W2-5 / EH-I-E)

## Status

Accepted — 2026-05-15.

## Context

Wave 2 hardening adds a step-up factor to login. The scope was
deliberately narrowed to **TOTP-only** for v1:

- WebAuthn / passkeys need device-attestation UX work that doesn't
  fit a Phase 1 slice.
- SMS is broadly considered weak against SIM-swap and the
  provider plumbing (Twilio etc.) is not warranted yet.

TOTP (RFC 6238) is universally supported by 1Password, Authy, Google
Authenticator, and every popular password manager. The choice that
remained was: which library, what enrolment shape, and how to
recover from a lost device.

## Decisions

### 1. Library: `otpauth` (+ `qrcode`)

`otpauth@^9.5.1` implements RFC 6238 HOTP/TOTP and Base32 secret
encoding — no hand-rolled HMAC. `qrcode@^1.5.4` renders the
`otpauth://...` URL to a PNG data URL server-side.

Chosen over `speakeasy` because:

- `speakeasy` has been on quiet maintenance for years; `otpauth` has
  active releases and a smaller dep footprint.
- `otpauth`'s `Secret.fromBase32()` / `TOTP.validate()` API is more
  ergonomic than `speakeasy.totp.verify`.

Both packages live in `dependencies`
([package.json](../../package.json#L43)).

### 2. Three-verb lifecycle: setup → confirm → verify

[shared/contracts/mfa.ts](../../shared/contracts/mfa.ts) splits
enrolment from steady-state validation:

- **`setupTotp(userId)`** — mints a fresh Base32 secret, writes a
  row to `user_mfa` with `confirmed_at = null`, returns
  `{ secret, otpauthUrl, qrCodeDataUrl }`. Re-calling `setupTotp`
  while an unconfirmed row exists **replaces** it
  ([mfa.real.ts](../../server/services/mfa.real.ts) `setupTotp`).
- **`confirmTotp(userId, code)`** — validates the user can produce a
  current code, flips `confirmed_at` to `now()`. From this point
  forward MFA is enabled for that user.
- **`verifyTotp(userId, code)`** — steady-state login-time check.
  Refuses to validate against unconfirmed rows (`!row.confirmedAt`
  → `{ ok: false }`).

Keeping enrolment and validation as distinct verbs prevents a class
of half-finished-enrolment bugs: there is no way for `verifyTotp` to
pass against a row that the user never proved they could read.

Clock skew tolerance: `window = 1` (≈30s either side). Explicit in
[mfa.real.ts](../../server/services/mfa.real.ts) so it shows up in
audit reviews.

### 3. Secret is stored ONLY in `user_mfa.secret_encrypted`

The Base32 secret is encrypted via `server/utils/crypto.ts`
(AES-256-GCM) before insert. The plaintext leaves the server **once**
— at `setupTotp` response time — and never again. There is no
`getSecret(userId)` API; a user who loses their device must reset MFA
and re-enroll.

The column name is `secret_encrypted` (forward-looking) even though
the v1 crypto helper is wired up today — the schema doc on
[user_mfa.ts](../../server/db/schema/user_mfa.ts) tracks the path to
envelope-encryption via a KMS-backed data key in Phase 2.

### 4. Backup codes: 10 codes, single-use, sha256-hashed, shown once

`generateBackupCodes(userId)` replaces the entire prior set:

1. Hard-deletes all unused rows for `userId`
   ([mfa.real.ts](../../server/services/mfa.real.ts)
   `generateBackupCodes`).
2. Inserts 10 fresh rows, each carrying
   `code_hash = sha256(rawCode)` (5 bytes of random hex per code,
   `randomBytes(5).toString('hex')`).
3. Returns the raw codes **exactly once**. The UI is responsible for
   the "save these, we'll never show them again" warning banner.

Partial sets were rejected: a user with "some old, some new" codes
can't reason about which is which.

Consumption: `consumeBackupCode` hashes the user-supplied string,
finds an unused row, flips `used_at`. One-time-use is enforced by
the `used_at IS NULL` predicate on lookup.

**On `mfa_backup_codes.codeHash`:** the schema doc comment historically
referenced bcrypt; the active implementation is sha256-hex.
SHA-256 is appropriate here because the input has full-entropy 40 bits
of randomness and the verifier is constant-time (Postgres equality on
a deterministic 64-char column). Bcrypt's slow-hash protection is
designed for low-entropy human passwords; for high-entropy
single-use tokens it just slows down each login.

### 5. Pre-auth `mfaToken`: JWT, kind=`mfa`, 5-minute TTL

After password verification but before MFA, `RealAuthService.login`
returns:

```ts
{ kind: 'mfa_required', mfaToken, email }
```

The `mfaToken` is a signed JWT
([auth.real.ts](../../server/services/auth.real.ts) `signToken`)
with payload:

```ts
interface MfaTokenPayload { kind: 'mfa'; userId: string }
```

TTL is `MFA_TOKEN_TTL_MS = 5 * 60 * 1000`. The token grants the right
to call `verifyMfa(mfaToken, code)` for one user — nothing else.

`verifyTokenOfKind<T>(token, kind)` enforces the `kind` discriminator
so a `reset` token cannot be replayed against the MFA endpoint and
vice versa.

### 6. Recovery: `disable` requires a live TOTP code OR a backup code

`disable(userId, currentCode)`:

1. Try `verifyTotp(userId, currentCode)`. If it passes, proceed.
2. Otherwise try `consumeBackupCode(userId, currentCode)`. If that
   passes (and consumes), proceed.
3. Otherwise return `{ disabled: false }`.

On success: soft-delete the `user_mfa` row and soft-delete all
backup codes. History is preserved; an admin can see the user
turned MFA off.

## Rejected alternatives

- **Returning the raw secret to the client whenever the user opens
  Settings → Security.** Rejected: once the authenticator app has
  the secret the user doesn't need it again, and re-displaying it
  widens the exfiltration surface. Lost-device flow is "reset and
  re-enroll", not "retrieve and re-type".
- **Storing the QR data URL in the DB.** Easy to re-mint from
  `issuer + label + secret`; persisting just wastes space.
- **`speakeasy`.** Quiet maintenance; chose `otpauth`.
- **SMS for v1.** SIM-swap risk + provider plumbing cost. Listed in
  §Future below.
- **WebAuthn for v1.** Device-attestation UX work too large for a
  Phase 1 slice. Listed in §Future.
- **bcrypt for backup codes.** Optimised for low-entropy human
  passwords; over-engineered for 40-bit single-use tokens.

## Known debt / Future

- **WebAuthn / passkeys.** The `MfaKindSchema` enum is the
  extension point — adding `'webauthn'` does not require a schema
  change to `user_mfa`. Phase 2.
- **SMS as a recovery channel** (not as a primary factor). Phase 2.
- **`secret_encrypted` is encrypted with a single deployment-wide
  data key.** Envelope encryption via KMS is Phase 2 / W3-1 along
  with provider-config + webhook secret sealing (see ADR-0021,
  ADR-0022).
- **No "remember this device for 30 days" cookie.** Every login
  prompts for the code. Cookie-based bypass is a known UX gap;
  deferred until customer demand surfaces.
