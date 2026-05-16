/**
 * shared/mocks/mfa.mock.ts — MockMfaService (W2-5 / EH-I / ADR-0024).
 *
 * # What this file does
 *   - In-memory `IMfaService` for offline/demo + unit tests. The real
 *     impl in `server/services/mfa.real.ts` mirrors the same surface.
 *   - Generates valid TOTP secrets via `otpauth` so the demo flow can
 *     actually be paired with a real authenticator app.
 *
 * # Decisions (ADR-0008, ADR-0024)
 *   - **Backup codes hashed with sha256.** Same algorithm as the real
 *     impl so unit tests catch shape drift early.
 *   - **State is module-level.** The factory caches a single instance;
 *     tests reset state via `__resetMockMfaForTests()`.
 *   - **`setupTotp` leaves the row UNCONFIRMED**; `confirmTotp` flips
 *     it. `getStatus().enabled` is true ONLY when confirmed, matching
 *     the real impl.
 *   - **QR data URL is best-effort.** When `qrcode` resolves we embed
 *     the PNG; if it doesn't (e.g. trimmed bundle) the otpauth URL
 *     alone is enough for any authenticator app to pair from text.
 */
import { createHash, randomBytes } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import type {
  IMfaService,
  MfaBackupCodesResult,
  MfaSetupResult,
  MfaStatus,
} from '../contracts/mfa'

interface MfaEnrolment {
  userId: string
  secret: string
  confirmed: boolean
}

interface BackupCode {
  userId: string
  hash: string
  used: boolean
}

const enrolments = new Map<string, MfaEnrolment>()
const backupCodes: BackupCode[] = []

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function makeTotp(secret: string, email = 'user@bulwark.demo'): TOTP {
  return new TOTP({
    issuer: 'Bulwark',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  })
}

async function renderQr(otpauthUrl: string): Promise<string> {
  try {
    const mod = await import('qrcode')
    return await mod.toDataURL(otpauthUrl)
  } catch {
    return ''
  }
}

function makeBackupCode(): string {
  // 10 hex chars (40 bits) — plenty of entropy for a single-use code,
  // short enough that a sleepy admin can still type it.
  return randomBytes(5).toString('hex')
}

export class MockMfaService implements IMfaService {
  async getStatus(userId: string): Promise<MfaStatus> {
    const e = enrolments.get(userId)
    const remaining = backupCodes.filter((b) => b.userId === userId && !b.used).length
    if (!e || !e.confirmed) return { enabled: false, backupCodesRemaining: remaining }
    return { enabled: true, kind: 'totp', backupCodesRemaining: remaining }
  }

  async setupTotp(userId: string): Promise<MfaSetupResult> {
    const secret = new Secret({ size: 20 }).base32
    enrolments.set(userId, { userId, secret, confirmed: false })
    const otpauthUrl = makeTotp(secret).toString()
    const qrCodeDataUrl = await renderQr(otpauthUrl)
    return { secret, otpauthUrl, qrCodeDataUrl }
  }

  async confirmTotp(userId: string, code: string): Promise<{ confirmed: boolean }> {
    const e = enrolments.get(userId)
    if (!e) return { confirmed: false }
    const totp = makeTotp(e.secret)
    const delta = totp.validate({ token: code, window: 1 })
    if (delta === null) return { confirmed: false }
    e.confirmed = true
    return { confirmed: true }
  }

  async verifyTotp(userId: string, code: string): Promise<{ ok: boolean }> {
    const e = enrolments.get(userId)
    if (!e || !e.confirmed) return { ok: false }
    const totp = makeTotp(e.secret)
    const delta = totp.validate({ token: code, window: 1 })
    return { ok: delta !== null }
  }

  async disable(userId: string, currentCode: string): Promise<{ disabled: boolean }> {
    const { ok } = await this.verifyTotp(userId, currentCode)
    if (!ok) {
      // Try backup code as fallback
      const consumed = await this.consumeBackupCode(userId, currentCode)
      if (!consumed.ok) return { disabled: false }
    }
    enrolments.delete(userId)
    for (let i = backupCodes.length - 1; i >= 0; i--) {
      if (backupCodes[i]!.userId === userId) backupCodes.splice(i, 1)
    }
    return { disabled: true }
  }

  async generateBackupCodes(userId: string): Promise<MfaBackupCodesResult> {
    // Replace any existing rows for this user.
    for (let i = backupCodes.length - 1; i >= 0; i--) {
      if (backupCodes[i]!.userId === userId) backupCodes.splice(i, 1)
    }
    const codes: string[] = []
    for (let i = 0; i < 10; i++) {
      const code = makeBackupCode()
      codes.push(code)
      backupCodes.push({ userId, hash: sha256hex(code), used: false })
    }
    return { codes }
  }

  async consumeBackupCode(userId: string, code: string) {
    const hash = sha256hex(code.trim())
    const match = backupCodes.find((b) => b.userId === userId && b.hash === hash && !b.used)
    if (!match) {
      const remaining = backupCodes.filter((b) => b.userId === userId && !b.used).length
      return { ok: false, remaining }
    }
    match.used = true
    const remaining = backupCodes.filter((b) => b.userId === userId && !b.used).length
    return { ok: true, remaining }
  }
}

/** Test-only: drop all in-memory enrolments + codes. */
export function __resetMockMfaForTests(): void {
  enrolments.clear()
  backupCodes.length = 0
}
