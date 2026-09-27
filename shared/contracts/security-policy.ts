/**
 * shared/contracts/security-policy.ts — per-organization security policy
 * (WP-L07 S2, ADR-0006, ED-001, ED-015).
 *
 * # Decisions
 *   - One policy per organization; an organization without a stored row uses
 *     DEFAULT_SECURITY_POLICY (the pre-L07 behaviour).
 *   - `mfaMode = required` blocks everything except sign-in, MFA enrolment and
 *     UI essentials until the member enrols (enforced in the RPC dispatcher).
 *   - `idleMinutes` signs a session out after inactivity. ED-001: when set,
 *     "Keep me signed in" is ignored — a persistent session would defeat it.
 *   - `trustedDays` is the "Keep me signed in" lifetime, capped at 90 (ED-015).
 */
import { z } from 'zod'
import { RoleSchema, UuidSchema } from './_shared'

export const MfaModeSchema = z.enum(['disabled', 'optional', 'required'])
export type MfaMode = z.infer<typeof MfaModeSchema>

export const SecurityPolicySchema = z.object({
  organizationId: UuidSchema,
  mfaMode: MfaModeSchema,
  idleMinutes: z.number().int().min(5).max(24 * 60).nullable(),
  lockoutAttempts: z.number().int().min(3).max(20),
  lockoutMinutes: z.number().int().min(1).max(24 * 60),
  trustedDays: z.number().int().min(1).max(90),
  /** False when the organization still runs on defaults. */
  saved: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
})
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>

export const DEFAULT_SECURITY_POLICY = {
  mfaMode: 'optional',
  idleMinutes: null,
  lockoutAttempts: 5,
  lockoutMinutes: 30,
  trustedDays: 30,
} as const satisfies Omit<SecurityPolicy, 'organizationId' | 'saved' | 'updatedAt'>

export const SecurityPolicyUpdateInputSchema = SecurityPolicySchema
  .pick({ organizationId: true, mfaMode: true, idleMinutes: true, lockoutAttempts: true, lockoutMinutes: true, trustedDays: true })
  .partial()
  .required({ organizationId: true })
export type SecurityPolicyUpdateInput = z.infer<typeof SecurityPolicyUpdateInputSchema>

export const MfaRosterRowSchema = z.object({
  userId: UuidSchema,
  fullName: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  mfaEnabled: z.boolean(),
})
export type MfaRosterRow = z.infer<typeof MfaRosterRowSchema>

/** What the signed-in member needs to know about their own organization's policy. */
export const MySecurityStatusSchema = z.object({
  mfaMode: MfaModeSchema,
  mfaEnrolled: z.boolean(),
  /** True when the organization requires MFA and this member has not enrolled. */
  mfaEnrollmentRequired: z.boolean(),
  idleMinutes: z.number().int().nullable(),
})
export type MySecurityStatus = z.infer<typeof MySecurityStatusSchema>

export interface ISecurityPolicyService {
  get(organizationId: string): Promise<SecurityPolicy>
  update(input: SecurityPolicyUpdateInput): Promise<SecurityPolicy>
  /** Members of the organization with their MFA enrolment state (admin). */
  mfaRoster(organizationId: string): Promise<MfaRosterRow[]>
  /** The session user's view of their active organization's policy. */
  getMine(): Promise<MySecurityStatus>
}
