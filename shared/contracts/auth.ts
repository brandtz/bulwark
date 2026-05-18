/**
 * shared/contracts/auth.ts — auth domain.
 *
 * Both MockAuthService and (future) RealAuthService implement IAuthService.
 * UI components import the inferred TS types — they never inline a shape.
 */
import { z } from 'zod'
import { RoleSchema, UuidSchema } from './_shared'

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password required'),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

export const SessionUserSchema = z.object({
  userId: UuidSchema,
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().url().nullable(),
  // The active org for this session. UI uses this to drive scope.
  activeOrganizationId: UuidSchema,
  activeRole: RoleSchema,
  // All orgs the user belongs to (for the OrgSwitcher).
  memberships: z.array(z.object({
    organizationId: UuidSchema,
    organizationName: z.string(),
    role: RoleSchema,
  })),
})
export type SessionUser = z.infer<typeof SessionUserSchema>

export const AuthResultSchema = z.object({
  user: SessionUserSchema,
})
export type AuthResult = z.infer<typeof AuthResultSchema>

// --- MFA-aware login result (W2-5 / ADR-0024) -------------------------------
//
// When the account has MFA enabled, `login()` returns a "step-up" envelope
// instead of a session: a short-lived JWT proves the password step succeeded,
// the client posts back to `verifyMfa()` with a 6-digit TOTP code (or a
// backup code). The discriminant `kind` keeps the wire shape unambiguous.
export const MfaChallengeResultSchema = z.object({
  kind: z.literal('mfa_required'),
  mfaToken: z.string().min(1),
  /** Echo back so the UI can show "Code for drew@…" without re-asking. */
  email: z.string().email(),
})
export type MfaChallengeResult = z.infer<typeof MfaChallengeResultSchema>

export const AuthLoginResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session') }).merge(AuthResultSchema),
  MfaChallengeResultSchema,
])
export type AuthLoginResult = z.infer<typeof AuthLoginResultSchema>

// --- Auth attempt log (W2-5 / ADR-0023) -------------------------------------
export const AuthAttemptRowSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  ipAddress: z.string().nullable(),
  success: z.boolean(),
  reason: z.string().nullable(),
  occurredAt: z.string().datetime(),
})
export type AuthAttemptRow = z.infer<typeof AuthAttemptRowSchema>

export const GetAttemptsInputSchema = z.object({
  organizationId: UuidSchema.optional(),
  email: z.string().email().optional(),
  userId: UuidSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
})
export type GetAttemptsInput = z.infer<typeof GetAttemptsInputSchema>

export const LockoutStateSchema = z.object({
  locked: z.boolean(),
  /** Epoch milliseconds; null when not locked. */
  until: z.number().nullable(),
  attemptsRemaining: z.number().int().nonnegative(),
})
export type LockoutState = z.infer<typeof LockoutStateSchema>

// --- Password reset & invitation flows (E2-S2) -------------------------------
//
// Why the issued/decoded "token" is part of the contract surface
// --------------------------------------------------------------
// In production the token is a signed JWT (or a row in `password_resets`).
// In the demo it's a base64url JSON blob. Either way the page only ever
// receives `?token=...` and POSTs it back. Pages stay identical when we
// swap MockAuthService for RealAuthService.

export const PasswordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')

export const RequestPasswordResetInputSchema = z.object({
  email: z.string().email(),
})
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetInputSchema>

export const RequestPasswordResetResultSchema = z.object({
  // Always returns success-shaped data so we don't leak whether an email
  // exists. `devToken` is populated only in mock/dev so the UI can show a
  // clickable convenience link instead of asking the user to check email.
  devToken: z.string().nullable(),
})
export type RequestPasswordResetResult = z.infer<typeof RequestPasswordResetResultSchema>

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordPolicy,
})
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>

// --- Change password (E11 profile completion) -------------------------------
//
// Authenticated user changing their own password. Requires the current
// password as a knowledge-factor check (defence against an unattended
// browser session). Real backend re-hashes via bcrypt and writes
// users.password_hash. Mock accepts any non-empty current password.
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: PasswordPolicy,
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>

export const InvitePreviewSchema = z.object({
  email: z.string().email(),
  organizationName: z.string(),
  role: RoleSchema,
})
export type InvitePreview = z.infer<typeof InvitePreviewSchema>

export const AcceptInviteInputSchema = z.object({
  token: z.string().min(1),
  fullName: z.string().min(1, 'Name required'),
  password: PasswordPolicy,
})
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>

export interface IAuthService {
  /**
   * Password-step login. Returns either a real session OR an MFA challenge.
   * The H3 API route forwards `ipAddress` (from `getRequestIP`) so the
   * service can write to `auth_attempts` and enforce lockouts.
   */
  login(input: LoginInput, opts?: { ipAddress?: string | null }): Promise<AuthLoginResult>
  /**
   * MFA-step login. Consumes a short-lived mfa token + a 6-digit TOTP
   * OR a backup code. On success the real session is issued.
   */
  verifyMfa(mfaToken: string, code: string, opts?: { ipAddress?: string | null }): Promise<AuthResult>
  logout(): Promise<void>
  currentUser(): Promise<SessionUser | null>
  switchActiveOrg(organizationId: string): Promise<SessionUser>

  // Password reset.
  requestPasswordReset(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult>
  resetPassword(input: ResetPasswordInput): Promise<AuthResult>

  // Authenticated password change (profile page).
  changePassword(input: ChangePasswordInput): Promise<void>

  // Invitations.
  previewInvite(token: string): Promise<InvitePreview>
  acceptInvite(input: AcceptInviteInput): Promise<AuthResult>

  // W2-5 — admin-visible attempt log + pre-auth lockout state.
  getAttempts(input: GetAttemptsInput): Promise<{ attempts: AuthAttemptRow[] }>
  getLockoutState(input: { email: string }): Promise<LockoutState>
}
