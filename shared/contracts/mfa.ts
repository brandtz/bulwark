/**
 * shared/contracts/mfa.ts — multi-factor authentication (W2-5 / EH-I / ADR-0024).
 *
 * # What this file does
 *   - Encodes the wire shapes for TOTP enrollment, verification, and
 *     backup-code lifecycle. Both `MockMfaService` and `RealMfaService`
 *     implement `IMfaService`; the login flow and `/profile/security`
 *     page consume those impls through `useService('mfa')`.
 *
 * # Decisions (ADR-0024-totp-mfa, ADR-0008)
 *   - **v1 supports `totp` only.** `MfaKindSchema` is an enum already so
 *     future kinds (webauthn, sms) graft on without a schema change.
 *   - **Backup codes are shown EXACTLY ONCE.** `MfaBackupCodesResult`
 *     returns the raw codes only at creation/regeneration. The DB stores
 *     a SHA-256 hash; a future `getStatus()` call returns the
 *     `remaining` count but never the code text.
 *   - **`setupTotp` returns BOTH the otpauth URL and a QR data URL.**
 *     The QR is generated server-side via the `qrcode` npm package so
 *     the client never has to know how to render a QR. When `qrcode`
 *     is unavailable the otpauth URL alone is enough to pair via any
 *     authenticator app.
 *   - **`confirmTotp` is a separate step from `verifyTotp`.** Confirm
 *     transitions an unconfirmed enrolment into a confirmed one
 *     (`user_mfa.confirmed_at` flips); verify is the steady-state
 *     login-time check. Keeping the verbs distinct avoids enrolment
 *     bugs (we never want a half-finished enrolment to gate logins).
 *   - **`generateBackupCodes` REPLACES the existing set.** Regenerating
 *     deletes all unused rows and inserts ten fresh — partial sets
 *     would be a UX foot-gun ("which set are these from?"). The user
 *     is forced to capture the new codes.
 *
 * # Decision cast down
 *   - Returning the raw secret to the client forever. Rejected — once
 *     enrolment is confirmed the secret is irrelevant to the user; the
 *     authenticator app already holds it. Continuing to return it just
 *     widens the exfiltration surface.
 *   - Supporting SMS at v1. Rejected — SMS is broadly considered weak
 *     against SIM-swap and the provider plumbing is not warranted for
 *     a Phase 1 ship. Listed in ADR-0024 §Future.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const MfaKindSchema = z.enum(['totp'])
export type MfaKind = z.infer<typeof MfaKindSchema>

export const MfaStatusSchema = z.object({
  enabled: z.boolean(),
  kind: MfaKindSchema.optional(),
  backupCodesRemaining: z.number().int().nonnegative(),
})
export type MfaStatus = z.infer<typeof MfaStatusSchema>

export const MfaSetupResultSchema = z.object({
  /** Base32 TOTP secret. Shown once for "enter manually" pairing. */
  secret: z.string(),
  /** otpauth://... URL the authenticator app will accept directly. */
  otpauthUrl: z.string(),
  /** `data:image/png;base64,...` QR encoding the otpauthUrl. Empty string when qrcode unavailable. */
  qrCodeDataUrl: z.string(),
})
export type MfaSetupResult = z.infer<typeof MfaSetupResultSchema>

export const MfaBackupCodesResultSchema = z.object({
  /** Raw codes shown once. Persistence stores sha256-hashed values. */
  codes: z.array(z.string()),
})
export type MfaBackupCodesResult = z.infer<typeof MfaBackupCodesResultSchema>

export const MfaConfirmInputSchema = z.object({
  userId: UuidSchema,
  code: z.string().min(4),
})
export type MfaConfirmInput = z.infer<typeof MfaConfirmInputSchema>

export const MfaConsumeBackupResultSchema = z.object({
  ok: z.boolean(),
  remaining: z.number().int().nonnegative(),
})
export type MfaConsumeBackupResult = z.infer<typeof MfaConsumeBackupResultSchema>

export interface IMfaService {
  getStatus(userId: string): Promise<MfaStatus>
  setupTotp(userId: string): Promise<MfaSetupResult>
  confirmTotp(userId: string, code: string): Promise<{ confirmed: boolean }>
  verifyTotp(userId: string, code: string): Promise<{ ok: boolean }>
  disable(userId: string, currentCode: string): Promise<{ disabled: boolean }>
  generateBackupCodes(userId: string): Promise<MfaBackupCodesResult>
  consumeBackupCode(userId: string, code: string): Promise<MfaConsumeBackupResult>
}
