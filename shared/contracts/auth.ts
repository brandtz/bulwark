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

export interface IAuthService {
  login(input: LoginInput): Promise<AuthResult>
  logout(): Promise<void>
  currentUser(): Promise<SessionUser | null>
  switchActiveOrg(organizationId: string): Promise<SessionUser>
}
