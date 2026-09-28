/**
 * tests/unit/rpc-policy-snapshot.test.ts — WP-Q2.
 *
 * 1. The live RPC policy must equal the reviewed snapshot. Widening or
 *    narrowing any gate fails here until the snapshot is deliberately
 *    regenerated (scripts/security/rpc-policy-snapshot.mjs), so the change is
 *    visible in review.
 * 2. Mutation guard (proves the matrix is not tautological): weaken one gate in
 *    a copy of the policy and check that both the snapshot diff and the HTTP
 *    denial matrix catch it.
 *
 * Deliberately weakening a gate in a branch — e.g. adding 'viewer' to
 * user.invite in server/utils/rpc-policy.ts — fails test 1 here and, on the
 * running server, the matching case in tests/e2e/rbac-matrix.spec.ts.
 */
import { describe, expect, it } from 'vitest'
import { authorizeRpc, RPC_POLICY } from '~~/server/utils/rpc-policy'
import { denialCases, diffPolicy, normalizePolicy, ROLES, SNAPSHOT } from '../rbac/matrix'

describe('RPC policy snapshot (WP-Q2)', () => {
  it('live policy matches the reviewed snapshot', () => {
    const diff = diffPolicy(normalizePolicy(RPC_POLICY), SNAPSHOT.policy)
    expect(diff, `Policy changed — review, then run node scripts/security/rpc-policy-snapshot.mjs:\n${diff.join('\n')}`).toEqual([])
  })

  it('authorizeRpc agrees with the snapshot for every method x caller', () => {
    const disagreements: string[] = []
    for (const [service, methods] of Object.entries(SNAPSHOT.policy)) {
      for (const [method, rule] of Object.entries(methods)) {
        for (const role of [null, ...ROLES]) {
          const expected = rule === 'public' || (Array.isArray(rule) && role !== null && rule.includes(role))
          const got = authorizeRpc(service, method, role as never).allowed
          if (got !== expected) disagreements.push(`${service}.${method} as ${role ?? 'anonymous'}: expected ${expected}, got ${got}`)
        }
      }
    }
    expect(disagreements).toEqual([])
  })

  it('mutation guard: a weakened gate is caught by the diff and by the denial matrix', () => {
    const weakened = structuredClone(normalizePolicy(RPC_POLICY))
    const invite = weakened.user!.invite as string[]
    expect(invite).not.toContain('viewer') // precondition: viewers cannot invite
    invite.push('viewer')

    expect(diffPolicy(weakened, SNAPSHOT.policy)).toEqual(['user.invite: +viewer'])
    // The HTTP matrix (built from the snapshot, not the live policy) still
    // demands a 403 for viewer -> user.invite, so a server running the weakened
    // policy fails that e2e case.
    expect(denialCases()).toContainEqual({ service: 'user', method: 'invite', role: 'viewer', status: 403 })
    expect(denialCases(weakened)).not.toContainEqual({ service: 'user', method: 'invite', role: 'viewer', status: 403 })
  })

  it('system methods are denied to every caller and public ones to none', () => {
    const cases = denialCases()
    expect(cases).toContainEqual({ service: 'account', method: 'purgeExpiredDeletions', role: 'super_admin', status: 403 })
    expect(cases.some((c) => c.service === 'auth' && c.method === 'login')).toBe(false)
  })
})
