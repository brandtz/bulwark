/**
 * shared/mocks/security-policy.mock.ts — in-memory security policy (WP-L07 S2).
 * Mirrors RealSecurityPolicyService; enforcement (MFA gate, idle timeout,
 * lockout) exists only on the real backend.
 */
import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicyUpdateInputSchema,
  type ISecurityPolicyService,
  type MfaRosterRow,
  type MySecurityStatus,
  type SecurityPolicy,
  type SecurityPolicyUpdateInput,
} from '../contracts/security-policy'
import { assertSameTenant, type TenantResolver } from './tenant'

const policies = new Map<string, SecurityPolicy>()

function current(organizationId: string): SecurityPolicy {
  return policies.get(organizationId) ?? { organizationId, ...DEFAULT_SECURITY_POLICY, saved: false, updatedAt: null }
}

export class MockSecurityPolicyService implements ISecurityPolicyService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async get(organizationId: string): Promise<SecurityPolicy> {
    assertSameTenant(this.tenantResolver, organizationId)
    return current(organizationId)
  }

  async update(input: SecurityPolicyUpdateInput): Promise<SecurityPolicy> {
    const parsed = SecurityPolicyUpdateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, parsed.organizationId)
    const next: SecurityPolicy = { ...current(parsed.organizationId), ...parsed, saved: true, updatedAt: new Date().toISOString() }
    policies.set(parsed.organizationId, next)
    return next
  }

  async mfaRoster(organizationId: string): Promise<MfaRosterRow[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return []
  }

  async getMine(): Promise<MySecurityStatus> {
    const ctx = this.tenantResolver?.()
    if (!ctx) throw new Error('Authentication required')
    const policy = current(ctx.organizationId)
    return { mfaMode: policy.mfaMode, mfaEnrolled: false, mfaEnrollmentRequired: false, idleMinutes: policy.idleMinutes }
  }
}

export function __resetMockSecurityPoliciesForTests(): void {
  policies.clear()
}
