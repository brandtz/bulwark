/**
 * WP-L07 S7 — RPC role policy at the HTTP boundary (ED-055). Each row is a real
 * call through /api/services/:service/:method as a seeded persona.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { signIn } from './_helpers'

const BASE = 'http://localhost:3000'
const rpc = (request: APIRequestContext, service: string, method: string, args: unknown[] = []) =>
  request.post(`${BASE}/api/services/${service}/${method}`, { data: { args } })

test.describe('RPC role policy', () => {
  test.beforeEach(async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'API-level checks run once')
    test.skip(process.env.BULWARK_BACKEND !== 'real', 'the policy guards the real RPC dispatcher')
    await context.clearCookies()
  })

  test('anonymous callers reach public auth methods only', async ({ request }) => {
    expect((await rpc(request, 'property', 'list', [{ organizationId: '00000000-0000-0000-0000-000000000000' }])).status()).toBe(401)
    expect((await rpc(request, 'auth', 'currentUser')).status()).toBeLessThan(400)
    expect((await rpc(request, 'user', 'constructor')).status()).toBe(404)
  })

  const cases: Array<{ persona: string, allowed: Array<[string, string]>, denied: Array<[string, string]> }> = [
    {
      persona: 'matthew@bulwark.demo', // field
      allowed: [['property', 'list'], ['workOrder', 'list']],
      denied: [['user', 'invite'], ['providerConfig', 'list'], ['featureFlag', 'set'], ['account', 'purgeExpiredDeletions'], ['audit', 'record']],
    },
    {
      persona: 'homer@bulwark.demo', // homeowner
      allowed: [['homeowner', 'listMyQuotes'], ['homeowner', 'listMyInvoices']],
      denied: [['property', 'list'], ['quote', 'list'], ['invoice', 'list'], ['client', 'list'], ['homeowner', 'listForUser'], ['user', 'list']],
    },
    {
      persona: 'jeff@bulwark.demo', // sub_contractor
      allowed: [],
      denied: [['quote', 'list'], ['property', 'list'], ['search', 'search'], ['user', 'invite']],
    },
    {
      persona: 'vivian@bulwark.demo', // viewer
      allowed: [['property', 'list']],
      denied: [['property', 'update'], ['inspection', 'submit'], ['user', 'invite']],
    },
    {
      persona: 'drew@bulwark.demo', // org_admin
      allowed: [['providerConfig', 'list'], ['user', 'list'], ['comms', 'deliveryHealth']],
      denied: [['account', 'purgeExpiredDeletions'], ['notification', 'enqueue'], ['homeowner', 'listMyQuotes']],
    },
  ]

  for (const { persona, allowed, denied } of cases) {
    test(`${persona}: role policy`, async ({ browser }) => {
      const context = await browser.newContext()
      try {
        await signIn(context, persona)
        const me = await (await rpc(context.request, 'auth', 'currentUser')).json()
        const org = me.activeOrganizationId as string
        // Valid arguments for the allowed calls; denied calls are refused before arguments are read.
        const argsFor = (service: string, method: string): unknown[] => {
          if (method === 'deliveryHealth') return [{ organizationId: org, since: new Date(Date.now() - 86_400_000).toISOString() }]
          if (method.startsWith('listMy') || service === 'providerConfig') return [org]
          if (service === 'user') return [{ organizationId: org }]
          return [{ organizationId: org, page: 1, pageSize: 5 }]
        }
        for (const [service, method] of allowed) {
          const res = await rpc(context.request, service, method, argsFor(service, method))
          expect(res.status(), `${persona} ${service}.${method} → ${await res.text()}`).toBeLessThan(400)
        }
        for (const [service, method] of denied) {
          const res = await rpc(context.request, service, method, argsFor(service, method))
          expect(res.status(), `${persona} ${service}.${method}`).toBe(403)
        }
      } finally {
        await context.close()
      }
    })
  }
})
