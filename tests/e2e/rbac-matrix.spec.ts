/**
 * tests/e2e/rbac-matrix.spec.ts — WP-Q2 full RPC role matrix at the HTTP boundary.
 *
 * For every method in the reviewed snapshot (tests/rbac/rpc-policy.snapshot.json)
 * and every caller the snapshot forbids — the 8 personas plus anonymous — the
 * running server must answer 401/403. Denial happens in the dispatcher before
 * any service code runs, so these calls have no side effects. (Allowed pairs are
 * covered by feature specs; firing arbitrary allowed calls would mutate data.)
 *
 * Also: wrong-tenant calls. An org_admin of one demo org naming the other org's
 * id is refused by the tenant firewall.
 *
 * Expectations come from the snapshot, not server/utils/rpc-policy.ts, so a
 * widened gate on the server fails here (see tests/unit/rpc-policy-snapshot.test.ts).
 */
import { expect, test, type APIRequestContext, type Browser } from '@playwright/test'
import { signIn } from './_helpers'
import { PERSONAS } from './screens/_contract'
import { denialCases, ROLES, type DenialCase } from '../rbac/matrix'

const BASE = 'http://localhost:3000'

async function run(request: APIRequestContext, cases: DenialCase[]): Promise<string[]> {
  const wrong: string[] = []
  const queue = [...cases]
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const res = await request.post(`${BASE}/api/services/${c.service}/${c.method}`, { data: { args: [] } })
      const status = res.status()
      // Signed-in denials are 403; signed-out callers get 401, or 403 for `system`
      // methods, which refuse every caller (c.status already encodes both).
      if (status !== c.status) wrong.push(`${c.service}.${c.method} as ${c.role ?? 'anonymous'}: expected ${c.status}, got ${status}`)
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker))
  return wrong
}

async function signedInRequest(browser: Browser, email: string) {
  const context = await browser.newContext()
  await signIn(context, email)
  return context
}

test.describe('RPC role matrix (WP-Q2)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-level matrix runs once')
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'the policy guards the real RPC dispatcher')

  test('anonymous callers are refused every non-public method', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const wrong = await run(context.request, denialCases().filter((c) => c.role === null))
      expect(wrong, wrong.join('\n')).toEqual([])
    } finally {
      await context.close()
    }
  })

  for (const role of ROLES) {
    test(`${role} is refused every method the snapshot denies it`, async ({ browser }) => {
      test.setTimeout(120_000)
      const context = await signedInRequest(browser, PERSONAS[role]!)
      try {
        const me = await (await context.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
        expect(me?.activeRole, `persona for ${role}`).toBe(role)
        const cases = denialCases().filter((c) => c.role === role)
        expect(cases.length).toBeGreaterThan(0)
        const wrong = await run(context.request, cases)
        expect(wrong, wrong.join('\n')).toEqual([])
      } finally {
        await context.close()
      }
    })
  }

  test('an org_admin cannot reach another organization (tenant firewall)', async ({ browser }) => {
    const other = await signedInRequest(browser, 'ana@acme.demo')
    const otherOrg = (await (await other.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()).activeOrganizationId as string
    await other.close()

    const context = await signedInRequest(browser, 'drew@bulwark.demo')
    try {
      const me = await (await context.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
      expect(me.activeOrganizationId).not.toBe(otherOrg)
      const page = { organizationId: otherOrg, page: 1, pageSize: 1 }
      const calls: Array<[string, string, unknown[]]> = [
        ['property', 'list', [page]],
        ['quote', 'list', [page]],
        ['invoice', 'list', [page]],
        ['workOrder', 'list', [page]],
        ['client', 'list', [page]],
        ['audit', 'filter', [page]],
        ['user', 'list', [{ organizationId: otherOrg }]],
        ['property', 'get', ['00000000-0000-4000-8000-000000000001', otherOrg]],
        ['property', 'getMany', [[], otherOrg]],
        ['property', 'create', [{ organizationId: otherOrg, addressLine1: 'x', city: 'x', state: 'CA', postalCode: '0' }]],
        ['label', 'updateBranding', [{ organizationId: otherOrg, primaryColor: '#000000' }]],
      ]
      const wrong: string[] = []
      for (const [service, method, args] of calls) {
        const status = (await context.request.post(`${BASE}/api/services/${service}/${method}`, { data: { args } })).status()
        if (status !== 403) wrong.push(`${service}.${method} into another org: expected 403, got ${status}`)
      }
      expect(wrong, wrong.join('\n')).toEqual([])
    } finally {
      await context.close()
    }
  })
})
