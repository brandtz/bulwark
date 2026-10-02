/**
 * tests/unit/rpc-validation.test.ts — WP-X4.
 *
 * 1. Coverage: every method in the RPC policy has an args rule and vice
 *    versa; only `system` methods may skip validation. A new service method
 *    without a schema fails here.
 * 2. Planted-invalid calls produce field-level issues; valid calls (incl.
 *    omitted trailing optionals) produce none.
 */
import { describe, expect, it } from 'vitest'
import { RPC_POLICY } from '../../server/utils/rpc-policy'
import { RPC_ARGS } from '../../server/utils/rpc-args'
import { summarizeIssues, validateRpcArgs } from '../../server/utils/rpc-validation'
import { RpcInputError, fieldErrors } from '../../shared/utils/rpc-error'

const ORG = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'

describe('RPC args coverage (WP-X4)', () => {
  it('every policy method has an args rule, and no rule is orphaned', () => {
    const missing: string[] = []
    for (const [svc, methods] of Object.entries(RPC_POLICY)) {
      for (const m of Object.keys(methods)) if (!RPC_ARGS[svc]?.[m]) missing.push(`${svc}.${m}`)
    }
    const orphaned: string[] = []
    for (const [svc, methods] of Object.entries(RPC_ARGS)) {
      for (const m of Object.keys(methods)) if (!RPC_POLICY[svc]?.[m]) orphaned.push(`${svc}.${m}`)
    }
    expect(missing, 'add these to server/utils/rpc-args.ts').toEqual([])
    expect(orphaned, 'remove these from server/utils/rpc-args.ts').toEqual([])
  })

  it('only system methods skip validation', () => {
    const skipped: string[] = []
    for (const [svc, methods] of Object.entries(RPC_ARGS)) {
      for (const [m, rule] of Object.entries(methods)) {
        if (rule.kind === 'skip' && RPC_POLICY[svc]?.[m] !== 'system') skipped.push(`${svc}.${m}`)
      }
    }
    expect(skipped).toEqual([])
  })
})

describe('validateRpcArgs (WP-X4)', () => {
  it('client.create without a phone names the phone field', () => {
    const issues = validateRpcArgs('client', 'create', [{ organizationId: ORG, fullName: 'Pat Lee', email: null, preferredContact: 'email', notes: null }])
    expect(issues.map((i) => i.path.join('.'))).toContain('phone')
    expect(summarizeIssues(issues)).toMatch(/^Invalid input: phone: /u)
  })

  it('rejects non-UUID ids, wrong enums and extra arguments', () => {
    expect(validateRpcArgs('property', 'get', ['not-a-uuid', ORG])[0]).toMatchObject({ arg: 0, path: [] })
    const reject = validateRpcArgs('quote', 'reject', [{ id: ID, organizationId: ORG, reason: 'x', reasonCode: 'bogus' }])
    expect(reject.map((i) => i.path.join('.'))).toEqual(['reasonCode'])
    expect(validateRpcArgs('property', 'get', [ID, ORG, 'extra'])).toHaveLength(1)
  })

  it('accepts valid calls, including omitted trailing optionals', () => {
    expect(validateRpcArgs('property', 'get', [ID, ORG])).toEqual([])
    expect(validateRpcArgs('property', 'updateStatus', [ID, 'on_hold', ORG])).toEqual([])
    expect(validateRpcArgs('property', 'updateStatus', [ID, 'on_hold', ORG, 'Awaiting funding', { note: 'n', resumeOn: '2026-11-15' }])).toEqual([])
    expect(validateRpcArgs('auth', 'logout', [])).toEqual([])
    // JSON turns an omitted middle argument into null.
    expect(validateRpcArgs('property', 'updateStatus', [ID, 'scheduled', ORG, null, { note: 'n' }])).toEqual([])
  })

  it('nested paths come through for list items', () => {
    const issues = validateRpcArgs('invoice', 'create', [{
      organizationId: ORG, propertyId: ID, workOrderId: null, quoteId: null, dueAt: null, notes: null, markupPercent: 0, taxPercent: 0,
      lineItems: [{ id: ID, kind: 'labor', description: 'Visit', quantity: -1, unitCostCents: 100 }],
    }])
    expect(issues.map((i) => i.path.join('.'))).toContain('lineItems.0.quantity')
  })

  it('fieldErrors maps issues of the first argument by dotted path', () => {
    const err = new RpcInputError('Invalid input', [
      { arg: 0, path: ['phone'], message: 'Required' },
      { arg: 0, path: ['phone'], message: 'second' },
      { arg: 1, path: [], message: 'other arg' },
    ])
    expect(fieldErrors(err)).toEqual({ phone: 'Required' })
    expect(fieldErrors(new Error('x'))).toEqual({})
  })
})
