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
 * And the IDOR shape: each staff role naming its own org and another org's
 * real record id reads nothing and cannot update it.
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

  // IDOR shape: the caller names their OWN org (so the firewall's org check
  // passes) and a real record id from another org. Every staff role that may
  // read these records must get nothing back, and a write must not land.
  test('staff cannot read or write another org\'s record through their own org id (IDOR)', async ({ browser }) => {
    test.setTimeout(120_000)
    const rpc = async (ctx: { request: APIRequestContext }, service: string, method: string, args: unknown[]) => {
      const res = await ctx.request.post(`${BASE}/api/services/${service}/${method}`, { data: { args } })
      const text = await res.text()
      return { status: res.status(), body: text ? JSON.parse(text) as unknown : null }
    }
    const firstId = (body: unknown) => (body as { rows?: Array<{ id: string }> } | null)?.rows?.[0]?.id

    const acme = await signedInRequest(browser, 'ana@acme.demo')
    const acmeOrg = (await rpc(acme, 'auth', 'currentUser', [])).body as { activeOrganizationId: string }
    const organizationId = acmeOrg.activeOrganizationId
    const page = { organizationId, page: 1, pageSize: 1 }
    // The other org's own admin creates the records under attack (the Acme seed
    // is thin), then any seeded quotes/invoices/work orders join the probe.
    const created = await rpc(acme, 'property', 'create', [{ organizationId, addressLine1: `IDOR target ${Date.now()}`, city: 'Oakland', state: 'CA', postalCode: '94607' }])
    expect(created.status, 'other org creates its property').toBe(200)
    const acmeProperty = (created.body as { id: string }).id
    const client = await rpc(acme, 'client', 'create', [{ organizationId, fullName: 'IDOR Target Client', email: null, phone: '+15555550111', preferredContact: 'phone', notes: null }])
    expect(client.status, 'other org creates its client').toBe(200)
    const foreign: Array<[string, string]> = [['property', acmeProperty], ['client', (client.body as { id: string }).id]]
    for (const service of ['quote', 'invoice', 'workOrder']) {
      const id = firstId((await rpc(acme, service, 'list', [page])).body)
      if (id) foreign.push([service, id])
    }

    const wrong: string[] = []
    for (const role of ['org_admin', 'org_manager', 'field', 'viewer'] as const) {
      const context = await signedInRequest(browser, PERSONAS[role]!)
      try {
        const ownOrg = ((await rpc(context, 'auth', 'currentUser', [])).body as { activeOrganizationId: string }).activeOrganizationId
        for (const [service, id] of foreign) {
          const { status, body } = await rpc(context, service, 'get', [id, ownOrg])
          if (status < 400 && body !== null) wrong.push(`${role}: ${service}.get(<other org id>, own org) returned the record`)
        }
        if (role !== 'viewer') {
          const { status } = await rpc(context, 'property', 'update', [{ id: acmeProperty, organizationId: ownOrg, addressLine1: `IDOR ${role}` }])
          if (status < 400) wrong.push(`${role}: property.update on another org's property answered ${status}`)
        }
      } finally {
        await context.close()
      }
    }
    const after = (await rpc(acme, 'property', 'get', [acmeProperty, organizationId])).body as { addressLine1: string }
    await rpc(acme, 'property', 'softDelete', [acmeProperty, organizationId])
    await acme.close()
    // Unchanged: still the address the owner created, not an attacker's "IDOR <role>".
    expect(after.addressLine1).toMatch(/^IDOR target \d+$/u)
    expect(wrong, wrong.join('\n')).toEqual([])
  })
})
