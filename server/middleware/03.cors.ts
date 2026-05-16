/**
 * server/middleware/03.cors.ts — Nitro middleware wrapper
 * (W5-1 / EH-R / ADR-0035). The pure decider lives in
 * `server/utils/cors.ts` and is what the unit tests target.
 *
 * # Decisions (ADR-0008, ADR-0035)
 *   - **Same-origin by default** — no Access-Control-Allow-Origin
 *     unless `BULWARK_CORS_ORIGINS` is set.
 *   - **OPTIONS preflight** short-circuited to 204 with the
 *     allow-* headers in place.
 */
// h3 + Nitro auto-imports: defineEventHandler, getRequestHeader,
// sendNoContent, setResponseHeaders.
import { decideCors, parseAllowlist } from '../utils/cors'

export default defineEventHandler((event) => {
  const allowlist = parseAllowlist(process.env.BULWARK_CORS_ORIGINS)
  const method = event.method ?? event.node.req.method ?? 'GET'

  if (allowlist.length === 0) {
    // No allowlist configured → still terminate cross-origin preflight
    // requests with a clean 204 (no headers) so we never 404 on them.
    if (method === 'OPTIONS' && getRequestHeader(event, 'origin')) {
      return sendNoContent(event, 204)
    }
    return
  }

  const origin = getRequestHeader(event, 'origin') ?? null
  const decision = decideCors({ origin, method, allowlist })
  if (Object.keys(decision.headers).length > 0) {
    setResponseHeaders(event, decision.headers)
  }
  if (decision.preflight) {
    return sendNoContent(event, 204)
  }
})
