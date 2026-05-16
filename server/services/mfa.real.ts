/**
 * server/services/mfa.real.ts — RealMfaService (W2-5 / EH-I / ADR-0024).
 *
 * # What this file does
 *   - Persists per-user TOTP enrolments + sha256-hashed backup codes
 *     in Postgres. Secrets are AES-256-GCM encrypted via
 *     `server/utils/crypto.ts` before they hit `user_mfa.secret_encrypted`.
 *   - The TOTP math (RFC 6238) is delegated to `otpauth` so we never
 *     hand-roll HMAC/Base32.
 *
 * # Decisions (ADR-0024-totp-mfa, ADR-0008)
 *   - **Soft-delete on disable.** We set `deleted_at` on the user_mfa
 *     row + hard-delete unused backup codes. Audit history is
 *     preserved on the row; an admin can see a user disabled MFA.
 *   - **`generateBackupCodes` deletes unused rows first**, then
 *     inserts ten fresh — matches the contract guarantee that the
 *     prior set is invalidated.
 *   - **window=1** on TOTP validation (≈30s clock skew tolerance).
 *     The library's default; explicit here so it's auditable.
 *   - **QR rendered via the `qrcode` npm package** — installed alongside
 *     `otpauth`. When the import fails (trimmed bundle, missing native
 *     dep) we return the otpauth URL alone; the client falls back to
 *     "type the secret" rendering. ADR-0024 §QR captures this.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import type {
  IMfaService,
  MfaBackupCodesResult,
  MfaSetupResult,
  MfaStatus,
} from '../../shared/contracts/mfa'
import { getDb } from '../db/client'
import { userMfa } from '../db/schema/user_mfa'
import { mfaBackupCodes } from '../db/schema/mfa_backup_codes'
import { users } from '../db/schema/users'
import { encryptSecret, decryptSecret } from '../utils/crypto'

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function makeBackupCode(): string {
  return randomBytes(5).toString('hex')
}

async function renderQr(otpauthUrl: string): Promise<string> {
  try {
    const mod = await import('qrcode')
    return await mod.toDataURL(otpauthUrl)
  } catch {
    return ''
  }
}

function buildTotp(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: 'Bulwark',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  })
}

export class RealMfaService implements IMfaService {
  async getStatus(userId: string): Promise<MfaStatus> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(userMfa)
      .where(and(eq(userMfa.userId, userId), isNull(userMfa.deletedAt)))
      .limit(1)
    const codes = await db
      .select({ id: mfaBackupCodes.id })
      .from(mfaBackupCodes)
      .where(
        and(
          eq(mfaBackupCodes.userId, userId),
          isNull(mfaBackupCodes.usedAt),
          isNull(mfaBackupCodes.deletedAt),
        ),
      )
    const remaining = codes.length
    if (!row || !row.confirmedAt) {
      return { enabled: false, backupCodesRemaining: remaining }
    }
    return { enabled: true, kind: 'totp', backupCodesRemaining: remaining }
  }

  async setupTotp(userId: string): Promise<MfaSetupResult> {
    const db = getDb()
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
    const label = user?.email ?? 'user@bulwark'
    const secret = new Secret({ size: 20 }).base32
    const enc = encryptSecret(secret)

    // Replace any prior unconfirmed enrolment for the same kind.
    await db.delete(userMfa).where(and(eq(userMfa.userId, userId), eq(userMfa.kind, 'totp'), isNull(userMfa.confirmedAt)))
    await db.insert(userMfa).values({ userId, kind: 'totp', secretEncrypted: enc })

    const otpauthUrl = buildTotp(secret, label).toString()
    const qrCodeDataUrl = await renderQr(otpauthUrl)
    return { secret, otpauthUrl, qrCodeDataUrl }
  }

  async confirmTotp(userId: string, code: string): Promise<{ confirmed: boolean }> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(userMfa)
      .where(and(eq(userMfa.userId, userId), eq(userMfa.kind, 'totp'), isNull(userMfa.deletedAt)))
      .limit(1)
    if (!row) return { confirmed: false }
    const secret = decryptSecret(row.secretEncrypted)
    const totp = buildTotp(secret, 'user@bulwark')
    const delta = totp.validate({ token: code, window: 1 })
    if (delta === null) return { confirmed: false }
    if (!row.confirmedAt) {
      await db.update(userMfa).set({ confirmedAt: new Date() }).where(eq(userMfa.id, row.id))
    }
    return { confirmed: true }
  }

  async verifyTotp(userId: string, code: string): Promise<{ ok: boolean }> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(userMfa)
      .where(and(eq(userMfa.userId, userId), eq(userMfa.kind, 'totp'), isNull(userMfa.deletedAt)))
      .limit(1)
    if (!row || !row.confirmedAt) return { ok: false }
    const secret = decryptSecret(row.secretEncrypted)
    const totp = buildTotp(secret, 'user@bulwark')
    const delta = totp.validate({ token: code, window: 1 })
    return { ok: delta !== null }
  }

  async disable(userId: string, currentCode: string): Promise<{ disabled: boolean }> {
    const totp = await this.verifyTotp(userId, currentCode)
    if (!totp.ok) {
      const consumed = await this.consumeBackupCode(userId, currentCode)
      if (!consumed.ok) return { disabled: false }
    }
    const db = getDb()
    const now = new Date()
    await db.update(userMfa).set({ deletedAt: now }).where(and(eq(userMfa.userId, userId), eq(userMfa.kind, 'totp')))
    await db.update(mfaBackupCodes).set({ deletedAt: now }).where(eq(mfaBackupCodes.userId, userId))
    return { disabled: true }
  }

  async generateBackupCodes(userId: string): Promise<MfaBackupCodesResult> {
    const db = getDb()
    // Drop the previous unused set (hard delete — they're worthless once replaced).
    await db.delete(mfaBackupCodes).where(and(eq(mfaBackupCodes.userId, userId), isNull(mfaBackupCodes.usedAt)))
    const codes: string[] = []
    const rows = []
    for (let i = 0; i < 10; i++) {
      const c = makeBackupCode()
      codes.push(c)
      rows.push({ userId, codeHash: sha256hex(c) })
    }
    await db.insert(mfaBackupCodes).values(rows)
    return { codes }
  }

  async consumeBackupCode(userId: string, code: string) {
    const db = getDb()
    const hash = sha256hex(code.trim())
    const [match] = await db
      .select()
      .from(mfaBackupCodes)
      .where(
        and(
          eq(mfaBackupCodes.userId, userId),
          eq(mfaBackupCodes.codeHash, hash),
          isNull(mfaBackupCodes.usedAt),
          isNull(mfaBackupCodes.deletedAt),
        ),
      )
      .limit(1)
    if (!match) {
      const remainingRows = await db
        .select({ id: mfaBackupCodes.id })
        .from(mfaBackupCodes)
        .where(and(eq(mfaBackupCodes.userId, userId), isNull(mfaBackupCodes.usedAt), isNull(mfaBackupCodes.deletedAt)))
      return { ok: false, remaining: remainingRows.length }
    }
    await db.update(mfaBackupCodes).set({ usedAt: new Date() }).where(eq(mfaBackupCodes.id, match.id))
    const remainingRows = await db
      .select({ id: mfaBackupCodes.id })
      .from(mfaBackupCodes)
      .where(and(eq(mfaBackupCodes.userId, userId), isNull(mfaBackupCodes.usedAt), isNull(mfaBackupCodes.deletedAt)))
    return { ok: true, remaining: remainingRows.length }
  }
}
