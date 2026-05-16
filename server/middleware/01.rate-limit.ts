/**
 * server/middleware/01.rate-limit.ts — Nitro middleware wrapper
 * (W5-1 / EH-R / ADR-0035). See `server/utils/rate-limit.ts` for the
 * pure evaluator and rule registry — the unit tests target that file.
 *
 * # Decisions (ADR-0008, ADR-0035)
 *   - **Filename prefix `01.`** orders this ahead of every other
 *     middleware. A blocked request never gets a request-id or any
 *     downstream work assigned to it.
 *   - **Bypass + trusted-proxy** read from env at request time so a
 *     single Nitro instance can flip the flags without a restart.
 *   - **Logs + metrics on block only**. Allowed requests pay nothing.
 *   - **Redis-swap hook** is the `storage` object inside
 *     `server/utils/rate-limit.ts` — replacing it with an ioredis
 *     client makes this whole subsystem multi-instance-safe and
 *     leaves this file untouched.
 */
// h3 + Nitro auto-imports: defineEventHandler, getRequestHeader,
// readBody, setResponseHeader, setResponseStatus are global in the
// Nitro runtime (see .nuxt/types/nitro-imports.d.ts). Tests do NOT
// import this file — they target `server/utils/rate-limit.ts`.
import { log } from '../utils/logger'
import { incCounter, COUNTERS } from '../utils/metrics'
import {
  evaluateRateLimit,
  matchRateLimitRule,
  pickEmailFromBody,
} from '../utils/rate-limit'

export default defineEventHandler(async (event) => {
  if (process.env.BULWARK_RATE_LIMIT_DISABLED === '1') return

  const method = (event.method ?? event.node.req.method ?? 'GET').toUpperCase()
  const url = event.node.req.url ?? '/'
  const path = url.split('?')[0] ?? url
  const rule = matchRateLimitRule(path, method)

  // Sniff the body only when a matched rule actually needs an email
  // key. h3 caches the parsed body on the event so the dispatcher's
  // own readBody() later returns the same value.
  let email: string | null = null
  if (rule?.perEmail && method !== 'GET') {
    try {
      const body = await readBody(event)
      email = pickEmailFromBody(body)
    } catch {
      email = null
    }
  }

  let ip: string
  if (process.env.BULWARK_RATE_LIMIT_TRUST_PROXY === '1') {
    const fwd = getRequestHeader(event, 'x-forwarded-for')
    const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined
    ip = first || event.node.req.socket?.remoteAddress || 'unknown'
  } else {
    ip = event.node.req.socket?.remoteAddress ?? 'unknown'
  }

  const decision = evaluateRateLimit({ ip, path, method, email })
  if (decision.allowed) return

  log('warn', 'security.rate_limited', {
    kind: 'security.rate_limited',
    ip,
    route: path,
    method,
    rule: decision.rule?.key ?? 'global',
    dimension: decision.dimension,
    retryAfter: decision.retryAfter,
  })
  incCounter(COUNTERS.rateLimitBlocksTotal)

  setResponseHeader(event, 'Retry-After', decision.retryAfter)
  setResponseStatus(event, 429)
  return { error: 'rate_limited', retryAfter: decision.retryAfter }
})
