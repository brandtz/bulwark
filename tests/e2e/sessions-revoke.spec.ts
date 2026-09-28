/**
 * tests/e2e/sessions-revoke.spec.ts — WP-X2 / ED-015 acceptance: revoking a
 * session from device A signs device B out on its next request.
 *
 * Two independent browser contexts sign in as the same user. B looks up its
 * own session id (the "current" row); A revokes exactly that id — never
 * "revoke others", which would sign out parallel workers using the persona.
 */
import { expect, test } from '@playwright/test'
import { signIn } from './_helpers'

const BASE = 'http://localhost:3000/api/services'
const EMAIL = 'matthew@bulwark.demo'

test.describe('sessions: revoke (ED-015)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-level check runs once')
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'user_sessions live in the real backend')

  test('revoking device B from device A signs B out on its next request', async ({ browser }) => {
    const a = await browser.newContext()
    const b = await browser.newContext()
    try {
      await signIn(a, EMAIL)
      await signIn(b, EMAIL)

      const bList = await (await b.request.post(`${BASE}/session/listMine`, { data: { args: [] } })).json() as Array<{ id: string, current: boolean }>
      const bId = bList.find((s) => s.current)?.id
      expect(bId, 'B sees its own current session').toBeTruthy()

      const aList = await (await a.request.post(`${BASE}/session/listMine`, { data: { args: [] } })).json() as Array<{ id: string, current: boolean }>
      expect(aList.map((s) => s.id)).toContain(bId)
      expect(aList.find((s) => s.id === bId)!.current).toBe(false)

      const revoke = await a.request.post(`${BASE}/session/revoke`, { data: { args: [bId] } })
      expect(revoke.ok()).toBe(true)

      // B's next request: signed out.
      const me = await b.request.post(`${BASE}/auth/currentUser`, { data: { args: [] } })
      expect(me.ok()).toBe(true)
      expect(await me.text()).toMatch(/^(null)?$/u)
      const denied = await b.request.post(`${BASE}/session/listMine`, { data: { args: [] } })
      expect(denied.status()).toBe(401)

      // A is untouched.
      const still = await a.request.post(`${BASE}/auth/currentUser`, { data: { args: [] } })
      expect((await still.json() as { email?: string } | null)?.email).toBe(EMAIL)
    } finally {
      await a.close()
      await b.close()
    }
  })
})
