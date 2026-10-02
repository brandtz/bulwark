/**
 * tests/e2e/rpc-validation.spec.ts — WP-X4 at the HTTP boundary.
 *
 * Malformed calls answer 400 with field-level issues and never reach the
 * database: nothing is created and no audit row is written. Real backend
 * only (the mock lane runs services in the browser, without the dispatcher).
 */
import { expect, test, type Page } from '@playwright/test'
import { activeOrgId, rpc, signInAsAdmin } from './_helpers'

const BASE = 'http://localhost:3000'

async function call(page: Page, service: string, method: string, args: unknown[]) {
  const res = await page.request.post(`${BASE}/api/services/${service}/${method}`, { data: { args } })
  return { status: res.status(), body: await res.json().catch(() => ({})) as { statusMessage?: string, data?: { issues?: Array<{ arg: number, path: Array<string | number>, message: string }> } } }
}

test.describe('RPC input validation (WP-X4)', () => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'needs the server dispatcher')
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-level checks run once')

  test('client.create without a phone is a 400 naming phone, and creates nothing', async ({ page }) => {
    await signInAsAdmin(page)
    const organizationId = await activeOrgId(page)
    const name = `X4 Nophone ${Date.now()}`
    const res = await call(page, 'client', 'create', [{ organizationId, fullName: name, email: null, preferredContact: 'email', notes: null }])
    expect(res.status).toBe(400)
    expect(res.body.statusMessage).toMatch(/^Invalid input: phone/u)
    expect(res.body.data?.issues?.some((i) => i.arg === 0 && i.path.join('.') === 'phone')).toBe(true)
    const list = await rpc<{ rows: unknown[] }>(page, 'client', 'list', [{ organizationId, search: name, page: 1, pageSize: 5 }])
    expect(list.rows).toHaveLength(0)
  })

  test('planted-invalid calls across services are refused before any write', async ({ page }) => {
    await signInAsAdmin(page)
    const organizationId = await activeOrgId(page)
    const token = `X4${Date.now() % 1_000_000}`
    const before = await rpc<{ total: number }>(page, 'audit', 'filter', [{ organizationId, page: 1, pageSize: 1 }])

    const cases: Array<[string, string, unknown[], string]> = [
      ['property', 'create', [{ organizationId, addressLine1: `${token} Bad St`, addressLine2: null, state: 'OR', postalCode: '97701', clientId: null, notes: null }], 'city'],
      ['property', 'updateStatus', ['not-a-uuid', 'scheduled', organizationId], ''],
      ['quote', 'reject', [{ id: crypto.randomUUID(), organizationId, reason: 'x', reasonCode: 'bogus' }], 'reasonCode'],
      ['invoice', 'create', [{ organizationId, propertyId: crypto.randomUUID(), workOrderId: null, quoteId: null, dueAt: null, notes: null, markupPercent: 0, taxPercent: 0, lineItems: [{ id: crypto.randomUUID(), kind: 'labor', description: 'Visit', quantity: -1, unitCostCents: 100 }] }], 'lineItems.0.quantity'],
    ]
    for (const [svc, method, args, field] of cases) {
      const res = await call(page, svc, method, args)
      expect(res.status, `${svc}.${method}`).toBe(400)
      expect(res.body.data?.issues?.some((i) => i.path.join('.') === field), `${svc}.${method} names ${field || 'the argument'}`).toBe(true)
    }

    const props = await rpc<{ rows: unknown[] }>(page, 'property', 'list', [{ organizationId, search: token, page: 1, pageSize: 5 }])
    expect(props.rows).toHaveLength(0)
    const after = await rpc<{ total: number }>(page, 'audit', 'filter', [{ organizationId, page: 1, pageSize: 1 }])
    expect(after.total).toBe(before.total)
  })
})
