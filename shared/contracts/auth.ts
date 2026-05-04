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
  login(input: LoginInput): Promise<AuthResult>
  logout(): Promise<void>
  currentUser(): Promise<SessionUser | null>
  switchActiveOrg(organizationId: string): Promise<SessionUser>

  // Password reset.
  requestPasswordReset(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult>
  resetPassword(input: ResetPasswordInput): Promise<AuthResult>

  // Invitations.
  previewInvite(token: string): Promise<InvitePreview>
  acceptInvite(input: AcceptInviteInput): Promise<AuthResult>
}
