/**
 * shared/contracts/homeowner.ts — Homeowner portal contract (W3-4 / EH-O / ADR-0032).
 *
 * # Decisions (ADR-0008, ADR-0032)
 *   - A homeowner is a regular `users` row with role=`homeowner` plus
 *     one or more `HomeownerUser` join rows mapping them to property
 *     ids. The portal pages read `listForUser(userId)` to know which
 *     properties to surface.
 *   - Invite creates `pending_invites` + a pre-staged `homeowner_users`
 *     row keyed by `propertyId`. Accept fills in `acceptedAt` and the
 *     resulting `users.id` via the join.
 *   - We don't expose `userId` on the contract on create — the invite
 *     row carries no user yet; it materializes after accept.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const HomeownerKindSchema = z.enum(['owner', 'tenant', 'spouse', 'other'])
export type HomeownerKind = z.infer<typeof HomeownerKindSchema>

export const HomeownerUserSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    propertyId: UuidSchema,
    userId: UuidSchema,
    email: z.string().email(),
    fullName: z.string(),
    kind: HomeownerKindSchema,
    invitedAt: z.string().datetime(),
    acceptedAt: z.string().datetime().nullable(),
  })
  .merge(AuditFieldsSchema)
export type HomeownerUser = z.infer<typeof HomeownerUserSchema>

export const HomeownerInviteInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  kind: HomeownerKindSchema.default('owner'),
  invitedByUserId: UuidSchema.nullable().optional(),
})
export type HomeownerInviteInput = z.infer<typeof HomeownerInviteInputSchema>

export const HomeownerInviteOutputSchema = z.object({
  inviteId: UuidSchema,
  membershipId: UuidSchema,
  inviteUrl: z.string(),
  inviteToken: z.string(),
})
export type HomeownerInviteOutput = z.infer<typeof HomeownerInviteOutputSchema>

export interface IHomeownerService {
  /** Memberships attached to a property (e.g. owner + spouse). */
  listForProperty(propertyId: string, organizationId: string): Promise<HomeownerUser[]>
  /** Memberships for a given user across all their properties. */
  listForUser(userId: string, organizationId: string): Promise<HomeownerUser[]>
  /** Invite a homeowner to a property. Creates invite + staged membership. */
  invite(input: HomeownerInviteInput): Promise<HomeownerInviteOutput>
  /** Soft-remove a membership. Audit-logged. */
  remove(membershipId: string, organizationId: string): Promise<void>
}
