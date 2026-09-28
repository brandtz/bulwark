#!/usr/bin/env node
/**
 * scripts/perf/lhci-session.mjs — sign a demo persona in and print a Cookie
 * header for Lighthouse CI (WP-L08 / epic L10-S1).
 *
 * LHCI audits pages anonymously; most budgeted routes are behind sign-in.
 * Rather than a puppeteer login script (an extra dependency), this performs the
 * real login flow over HTTP (CSRF cookie -> POST auth/login) and prints the
 * resulting cookies, which lighthouserc.cjs passes as `extraHeaders.Cookie`.
 *
 *   LHCI_COOKIE="$(node scripts/perf/lhci-session.mjs)" npx @lhci/cli autorun
 *
 * Env: LHCI_BASE_URL (default http://localhost:3000), LHCI_EMAIL
 * (default the org-admin demo persona), LHCI_PASSWORD (default demo password).
 * Refuses non-localhost targets so it can never be pointed at production.
 */
const base = process.env.LHCI_BASE_URL || 'http://localhost:3000'
const email = process.env.LHCI_EMAIL || 'drew@bulwark.demo'
const password = process.env.LHCI_PASSWORD || 'BulwarkDemo!1'

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(base)) {
  console.error(`lhci-session: refusing non-local target ${base}`)
  process.exit(1)
}

const jar = new Map()
const absorb = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

absorb(await fetch(`${base}/api/health`))
const csrf = jar.get('bulwark.csrf')
if (!csrf) {
  console.error('lhci-session: no bulwark.csrf cookie from /api/health')
  process.exit(1)
}
const res = await fetch(`${base}/api/services/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: cookieHeader() },
  body: JSON.stringify({ args: [{ email, password }] }),
})
absorb(res)
if (!res.ok) {
  console.error(`lhci-session: login failed (${res.status}) ${await res.text()}`)
  process.exit(1)
}
process.stdout.write(cookieHeader())
