/**
 * shared/contracts/user.ts — user + invite admin (W2-4 / EH-H Part B / ADR-0021).
 *
 * # What this file does
 *   - Encodes the Zod shape for an admin-visible org member, the
 *     pending-invite row, and the `IUserService` interface that both
 *     MockUserService and RealUserService implement.
 *   - Owns the per-tenant `UserStatus` derivation rule (see "Decisions").
 *
 * # Decisions captured here (ADR-0008, ADR-0021)
 *   - **Status is DERIVED, not stored** on the membership row directly.
 *     The four states map onto existing columns:
 *       - `invited` — `pending_invites` row exists, not yet accepted/revoked.
 *       - `active` — `memberships.isActive = true AND users.isActive = true`.
 *       - `suspended` — `memberships.isActive = false AND users.isActive = true`.
 *       - `deactivated` — `users.isActive = false`.
 *     This keeps W2-4 schema-conservative (no new column on the global
 *     `users` table, which W2-5 will mutate further).
 *   - **Two row types in one list**: the admin list shows both org
 *     members AND outstanding invites. Encoded here as a discriminated
 *     union (`kind: 'member' | 'invite'`) so the table can render
 *     uniformly and the action menu can branch on `kind`.
 *   - **`transferOwnership` is super_admin only**. Service implementations
 *     enforce. Contract documents the constraint but doesn't encode it
 *     (role gates live at the page + service layer).
 *   - **`inviteUrl` is returned only on `invite()` and never on a
 *     subsequent list.** Phase 1 emails the URL in W3-1; today the
 *     admin copies it from the success toast. The raw token is the
 *     only piece that never persists.
 *
 * # Decisions NOT taken
 *   - We considered moving acceptInvite onto `IUserService`. Rejected —
 *     `IAuthService.acceptInvite` already exists and is wired to the
 *     `/accept-invite` page; duplicating it would split call sites. The
 *     real implementation just learns to resolve a pending_invites row
 *     by token-hash before falling back to the legacy JWT path.
 */
import { z } from 'zod'
import { AuditFieldsSchema, RoleSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Status enum + filter inputs.
// ----------------------------------------------------------------------------
export const UserStatusSchema = z.enum([
  'active',
  'invited',
  'suspended',
  'deactivated',
])
export type UserStatus = z.infer<typeof UserStatusSchema>

// ----------------------------------------------------------------------------
// Discriminated-union row.
// ----------------------------------------------------------------------------
export const UserMemberRowSchema = z
  .object({
    kind: z.literal('member'),
    id: UuidSchema, // user id
    membershipUserId: UuidSchema,
    organizationId: UuidSchema,
    email: z.string().email(),
    fullName: z.string(),
    role: RoleSchema,
    status: UserStatusSchema, // one of: active | suspended | deactivated
    avatarUrl: z.string().url().nullable(),
  })
  .merge(AuditFieldsSchema)
export type UserMemberRow = z.infer<typeof UserMemberRowSchema>

export const UserInviteRowSchema = z
  .object({
    kind: z.literal('invite'),
    id: UuidSchema, // pending_invites.id
    organizationId: UuidSchema,
    email: z.string().email(),
    role: RoleSchema,
    status: z.literal('invited'),
    invitedByUserId: UuidSchema.nullable(),
    expiresAt: z.string().datetime(),
  })
  .merge(AuditFieldsSchema)
export type UserInviteRow = z.infer<typeof UserInviteRowSchema>

export const UserAdminRowSchema = z.discriminatedUnion('kind', [
  UserMemberRowSchema,
  UserInviteRowSchema,
])
export type UserAdminRow = z.infer<typeof UserAdminRowSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const UserListInputSchema = z.object({
  organizationId: UuidSchema,
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
})
export type UserListInput = z.infer<typeof UserListInputSchema>

export const UserListOutputSchema = z.object({
  users: z.array(UserAdminRowSchema),
})
export type UserListOutput = z.infer<typeof UserListOutputSchema>

export const InviteInputSchema = z.object({
  organizationId: UuidSchema,
  email: z.string().email(),
  role: RoleSchema,
  invitedByUserId: UuidSchema.nullable(),
})
export type InviteInput = z.infer<typeof InviteInputSchema>

export const InviteOutputSchema = z.object({
  inviteId: UuidSchema,
  /** Full URL with raw token. Shown ONCE; never returned again. */
  inviteUrl: z.string(),
  /** Raw token by itself, for tests that want to bypass URL parsing. */
  inviteToken: z.string(),
})
export type InviteOutput = z.infer<typeof InviteOutputSchema>

export const SetRoleInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema,
  role: RoleSchema,
})
export type SetRoleInput = z.infer<typeof SetRoleInputSchema>

export const TransferOwnershipInputSchema = z.object({
  organizationId: UuidSchema,
  newOwnerUserId: UuidSchema,
})
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IUserService {
  list(input: UserListInput): Promise<UserListOutput>
  invite(input: InviteInput): Promise<InviteOutput>
  revokeInvite(inviteId: string, organizationId: string): Promise<void>
  resendInvite(inviteId: string, organizationId: string): Promise<InviteOutput>
  setRole(input: SetRoleInput): Promise<void>
  suspend(userId: string, organizationId: string): Promise<void>
  reactivate(userId: string, organizationId: string): Promise<void>
  deactivate(userId: string, organizationId: string): Promise<void>
  /**
   * Super-admin only. Transfers the `org_admin` (or higher) ownership
   * mantle to another member; current owner becomes `org_manager`.
   * Service enforces caller role.
   */
  transferOwnership(input: TransferOwnershipInput): Promise<void>
}
