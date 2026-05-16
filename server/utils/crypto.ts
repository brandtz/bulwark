/**
 * server/utils/crypto.ts — AES-256-GCM helper for at-rest secrets
 * (W2-5 / EH-I / ADR-0024).
 *
 * # What this file does
 *   - Exposes `encryptSecret(plaintext)` / `decryptSecret(ciphertext)`
 *     used by `RealMfaService` to wrap TOTP shared secrets before
 *     they hit `user_mfa.secret_encrypted`.
 *   - The encryption key is derived from `JWT_SECRET` (or the
 *     `NUXT_SESSION_PASSWORD` fallback that the rest of the auth
 *     stack already requires) via `scrypt`. We hash the input once
 *     so the actual AES key length is correct even if the secret
 *     was longer/shorter than 32 bytes.
 *
 * # Decisions (ADR-0024-totp-mfa)
 *   - **AES-256-GCM**, not CBC. GCM provides authenticated encryption
 *     so a corrupted ciphertext fails fast (we surface that as
 *     "secret is unreadable; re-enroll MFA").
 *   - **Single key for the whole platform.** v1 is fine with this —
 *     the threat model is "stolen DB dump"; an attacker who already
 *     has the key has bigger problems. The forward path is KMS-
 *     wrapped DEKs once the platform reaches that maturity; ADR-0024
 *     §Future tracks it.
 *   - **Random 12-byte IV per call**, prefixed onto the ciphertext.
 *     12 bytes is the GCM-recommended IV length.
 *   - **Output is a single base64 string** so it round-trips cleanly
 *     through the text column.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  // W5-2 / ADR-0036: prefer `BULWARK_ENCRYPTION_KEY` so at-rest encryption
  // is rotatable independently from JWT signing. Fall back to JWT_SECRET
  // (ADR-0024 origin) and finally NUXT_SESSION_PASSWORD so existing dev
  // envs keep working without a re-keying step.
  const raw =
    process.env.BULWARK_ENCRYPTION_KEY ??
    process.env.JWT_SECRET ??
    process.env.NUXT_SESSION_PASSWORD ??
    ''
  if (raw.length < 16) {
    throw new Error(
      'BULWARK_ENCRYPTION_KEY (or JWT_SECRET / NUXT_SESSION_PASSWORD) must be set and >=16 chars',
    )
  }
  // Derive a 32-byte AES key deterministically. sha256(secret) is fine for
  // our threat model; production KMS work tracked in ADR-0024 §Future.
  return createHash('sha256').update(raw).digest()
}

/** Encrypt `plaintext` and return a base64 envelope of `iv|tag|ciphertext`. */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Decrypt the envelope produced by `encryptSecret`. Throws on tamper. */
export function decryptSecret(envelope: string): string {
  const key = getKey()
  const buf = Buffer.from(envelope, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Encrypted secret is malformed')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/**
 * Convenience wrapper for sealing structured objects (W5-2 / ADR-0036).
 * Used by `provider_configs.config_encrypted` to seal the JSONB blob
 * that previously held plaintext provider credentials. The envelope is
 * a base64 AES-GCM ciphertext from `encryptSecret`.
 */
export function encryptJsonBlob(value: unknown): string {
  return encryptSecret(JSON.stringify(value ?? {}))
}

/**
 * Decrypt + JSON.parse a blob written by `encryptJsonBlob`. Returns an
 * empty object if the envelope is empty/null so callers can treat
 * missing rows the same as legacy unsealed ones.
 */
export function decryptJsonBlob<T = Record<string, unknown>>(envelope: string | null | undefined): T {
  if (!envelope) return {} as T
  const raw = decryptSecret(envelope)
  try {
    return JSON.parse(raw) as T
  } catch {
    return {} as T
  }
}
