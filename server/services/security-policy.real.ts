/**
 * server/services/security-policy.real.ts — per-organization security policy
 * (WP-L07 S2). Contract and decisions: shared/contracts/security-policy.ts.
 *
 * Also exports the lookups the auth flow and RPC dispatcher use
 * (`loadSecurityPolicy`, `isMfaEnrolled`); they bypass the resolver because
 * callers are trusted server code acting on an identified user.
 */
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicyUpdateInputSchema,
  type ISecurityPolicyService,
  type MfaRosterRow,
  type MySecurityStatus,
  type SecurityPolicy,
  type SecurityPolicyUpdateInput,
} from '../../shared/contracts/security-policy'
import type { Role } from '../../shared/contracts/_shared'
import { getDb } from '../db/client'
import { securityPolicies, type SecurityPolicyRow } from '../db/schema/security_policies'
import { memberships, users } from '../db/schema/users'
import { userMfa } from '../db/schema/user_mfa'
import { assertSameTenant, resolveActorUserId, SYSTEM_USER_ID, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function toContract(organizationId: string, row: SecurityPolicyRow | undefined): SecurityPolicy {
  if (!row) return { organizationId, ...DEFAULT_SECURITY_POLICY, saved: false, updatedAt: null }
  return {
    organizationId,
    mfaMode: row.mfaMode as SecurityPolicy['mfaMode'],
    idleMinutes: row.idleMinutes,
    lockoutAttempts: row.lockoutAttempts,
    lockoutMinutes: row.lockoutMinutes,
    trustedDays: row.trustedDays,
    saved: true,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function loadSecurityPolicy(organizationId: string): Promise<SecurityPolicy> {
  const [row] = await getDb()
    .select()
    .from(securityPolicies)
    .where(and(eq(securityPolicies.organizationId, organizationId), isNull(securityPolicies.deletedAt)))
    .limit(1)
  return toContract(organizationId, row)
}

export async function isMfaEnrolled(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: userMfa.id })
    .from(userMfa)
    .where(and(eq(userMfa.userId, userId), isNotNull(userMfa.confirmedAt), isNull(userMfa.deletedAt)))
    .limit(1)
  return !!row
}

/** Policy of the organization a user signs into by default (first active membership). */
export async function loadPolicyForUser(userId: string): Promise<SecurityPolicy | null> {
  const [membership] = await getDb()
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true)))
    .orderBy(asc(memberships.createdAt))
    .limit(1)
  return membership ? loadSecurityPolicy(membership.organizationId) : null
}

export class RealSecurityPolicyService implements ISecurityPolicyService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async get(organizationId: string): Promise<SecurityPolicy> {
    assertSameTenant(this.tenantResolver, organizationId)
    return loadSecurityPolicy(organizationId)
  }

  async update(input: SecurityPolicyUpdateInput): Promise<SecurityPolicy> {
    const parsed = SecurityPolicyUpdateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, parsed.organizationId)
    const before = await loadSecurityPolicy(parsed.organizationId)
    const { organizationId, ...changes } = parsed
    const next = { ...before, ...changes }
    const actor = resolveActorUserId(this.tenantResolver)
    await withAudit(async ({ tx, audit }) => {
      const values = {
        mfaMode: next.mfaMode,
        idleMinutes: next.idleMinutes,
        lockoutAttempts: next.lockoutAttempts,
        lockoutMinutes: next.lockoutMinutes,
        trustedDays: next.trustedDays,
        updatedById: actor,
        updatedAt: new Date(),
      }
      await tx.insert(securityPolicies)
        .values({ organizationId, ...values })
        .onConflictDoUpdate({ target: securityPolicies.organizationId, set: values })
      await audit.record({
        organizationId,
        entityType: 'security_policy',
        entityId: organizationId,
        action: 'update',
        actorUserId: actor,
        before: { mfaMode: before.mfaMode, idleMinutes: before.idleMinutes, lockoutAttempts: before.lockoutAttempts, lockoutMinutes: before.lockoutMinutes, trustedDays: before.trustedDays },
        after: changes,
      })
    })
    return loadSecurityPolicy(organizationId)
  }

  async mfaRoster(organizationId: string): Promise<MfaRosterRow[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const rows = await getDb()
      .select({ userId: users.id, fullName: users.fullName, email: users.email, role: memberships.role, confirmedAt: userMfa.confirmedAt, mfaDeletedAt: userMfa.deletedAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(userMfa, eq(userMfa.userId, users.id))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.isActive, true)))
      .orderBy(asc(users.fullName))
    const byUser = new Map<string, MfaRosterRow>()
    for (const r of rows) {
      const enrolled = !!r.confirmedAt && !r.mfaDeletedAt
      const prev = byUser.get(r.userId)
      byUser.set(r.userId, { userId: r.userId, fullName: r.fullName, email: r.email, role: r.role as Role, mfaEnabled: enrolled || !!prev?.mfaEnabled })
    }
    return [...byUser.values()]
  }

  async getMine(): Promise<MySecurityStatus> {
    const ctx = this.tenantResolver?.()
    if (!ctx || ctx.userId === SYSTEM_USER_ID) throw new Error('Authentication required')
    const [policy, enrolled] = await Promise.all([loadSecurityPolicy(ctx.organizationId), isMfaEnrolled(ctx.userId)])
    return {
      mfaMode: policy.mfaMode,
      mfaEnrolled: enrolled,
      mfaEnrollmentRequired: policy.mfaMode === 'required' && !enrolled,
      idleMinutes: policy.idleMinutes,
    }
  }
}
