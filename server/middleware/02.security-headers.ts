/**
 * server/middleware/02.security-headers.ts — Nitro middleware wrapper
 * (W5-1 / EH-R / ADR-0035). The pure header builder lives in
 * `server/utils/security-headers.ts` and is what the unit tests
 * target.
 *
 * # Decisions (ADR-0008, ADR-0035)
 *   - **Filename prefix `02.`** — runs after rate-limit so a blocked
 *     request doesn't bother setting headers it'll throw away.
 *   - **CSP only for HTML paths** — see `isHtmlPath` in the utils.
 *   - **HSTS gated** on `NODE_ENV=production` or
 *     `BULWARK_FORCE_HSTS=1`.
 */
// h3 + Nitro auto-imports: defineEventHandler, setResponseHeaders.
import { buildSecurityHeaders, isHtmlPath } from '../utils/security-headers'

export default defineEventHandler((event) => {
  const url = event.node.req.url ?? '/'
  const path = url.split('?')[0] ?? url
  const headers = buildSecurityHeaders({ isHtml: isHtmlPath(path) })
  setResponseHeaders(event, headers)
})
