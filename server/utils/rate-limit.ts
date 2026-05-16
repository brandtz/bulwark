/**
 * server/utils/rate-limit.ts — pure rate-limit policy + bucket store
 * (W5-1 / EH-R / ADR-0035).
 *
 * # Decisions (ADR-0008, ADR-0023, ADR-0035)
 *   - **Fixed-window token-bucket** in a `Map<string, { count,
 *     resetAt }>`. Per-instance only; Phase 1 deployments run a
 *     single Nitro process. Redis-swap hook: replace the
 *     `memoryStore` object below with one that talks to ioredis
 *     and the rest of the module — including
 *     `server/middleware/01.rate-limit.ts` — is unchanged.
 *   - **Two dimensions** per rule: per-IP and optionally per-email.
 *     Whichever bucket fills first wins the 429 + retry-after.
 *   - **Pure evaluator** lives here so tests can drive the policy
 *     without the h3 runtime; the middleware file is a thin
 *     adapter that resolves IP / body and calls `evaluateRateLimit`.
 *   - **Bypass `BULWARK_RATE_LIMIT_DISABLED=1`** short-circuits the
 *     evaluator to a no-op for e2e / dev. Read at call time so a
 *     single import survives mid-suite env mutations.
 *
 * # Decision cast down
 *   - **Sliding-window log** rejected — needs a per-key array of
 *     timestamps; fixed-window error is already <2× the configured
 *     cap at the boundary which is acceptable for a DoS shield.
 */
export interface Limit {
  capacity: number
  windowMs: number
}

export interface RateLimitRule {
  /** Friendly key used in the storage map; must be unique per rule. */
  key: string
  /** Matched against `event.path` (pathname only). */
  pattern: RegExp
  /** Restrict by HTTP method (default: any). */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Per-IP bucket; falls back to GLOBAL_LIMIT if omitted. */
  perIp?: Limit
  /** Per-email bucket (only enforced if email parsed from body). */
  perEmail?: Limit
}

export const GLOBAL_LIMIT: Limit = { capacity: 60, windowMs: 60_000 }

// Order matters — the first match wins. The auth dispatcher paths
// look like `/api/services/auth/<method>`; the patterns also accept
// the brief's documented `/api/auth/<verb>` form so the rules survive
// any future direct-route refactor.
export const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    key: 'auth.login',
    pattern: /^\/api\/(?:services\/)?auth\/login$/,
    method: 'POST',
    perIp: { capacity: 10, windowMs: 60_000 },
    perEmail: { capacity: 5, windowMs: 60_000 },
  },
  {
    key: 'auth.accept-invite',
    pattern: /^\/api\/(?:services\/)?auth\/(?:acceptInvite|accept-invite)$/,
    method: 'POST',
    perIp: { capacity: 5, windowMs: 60_000 },
  },
  {
    key: 'auth.forgot-password',
    pattern: /^\/api\/(?:services\/)?auth\/(?:requestPasswordReset|forgot-password|forgotPassword)$/,
    method: 'POST',
    perIp: { capacity: 5, windowMs: 60_000 },
    perEmail: { capacity: 3, windowMs: 60_000 },
  },
  {
    key: 'auth.catch-all',
    pattern: /^\/api\/(?:services\/)?auth\//,
    method: 'POST',
    perIp: { capacity: 20, windowMs: 60_000 },
  },
]

// ---------------------------------------------------------------------------
// Bucket storage — swap this object for a Redis client to share buckets
// across Nitro instances. Interface is intentionally narrow.
// ---------------------------------------------------------------------------
interface BucketStore {
  get(key: string): { count: number; resetAt: number } | undefined
  set(key: string, value: { count: number; resetAt: number }): void
  clear(): void
}

const memoryStore: BucketStore = (() => {
  const m = new Map<string, { count: number; resetAt: number }>()
  return {
    get: (k) => m.get(k),
    set: (k, v) => void m.set(k, v),
    clear: () => m.clear(),
  }
})()

const storage: BucketStore = memoryStore

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------
export interface RateLimitInput {
  ip: string
  path: string
  method: string
  email?: string | null
  now?: number
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfter: number
  rule: RateLimitRule | null
  dimension: 'ip' | 'email' | 'global' | null
}

export function matchRateLimitRule(path: string, method: string): RateLimitRule | null {
  for (const r of RATE_LIMIT_RULES) {
    if (r.method && r.method !== method) continue
    if (r.pattern.test(path)) return r
  }
  return null
}

function consume(
  key: string,
  limit: Limit,
  now: number,
): { allowed: boolean; retryAfter: number } {
  const existing = storage.get(key)
  if (!existing || existing.resetAt <= now) {
    storage.set(key, { count: 1, resetAt: now + limit.windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  if (existing.count >= limit.capacity) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }
  existing.count += 1
  storage.set(key, existing)
  return { allowed: true, retryAfter: 0 }
}

export function evaluateRateLimit(input: RateLimitInput): RateLimitDecision {
  if (process.env.BULWARK_RATE_LIMIT_DISABLED === '1') {
    return { allowed: true, retryAfter: 0, rule: null, dimension: null }
  }
  const now = input.now ?? Date.now()
  const rule = matchRateLimitRule(input.path, input.method)
  const effectiveIp = rule?.perIp ?? GLOBAL_LIMIT
  const dimension: 'ip' | 'global' = rule?.perIp ? 'ip' : 'global'
  const ipKey = `${rule?.key ?? 'global'}:ip:${input.ip}`
  const ipDec = consume(ipKey, effectiveIp, now)
  if (!ipDec.allowed) {
    return { allowed: false, retryAfter: ipDec.retryAfter, rule, dimension }
  }
  if (rule?.perEmail && input.email) {
    const emailKey = `${rule.key}:email:${input.email.toLowerCase()}`
    const emailDec = consume(emailKey, rule.perEmail, now)
    if (!emailDec.allowed) {
      return { allowed: false, retryAfter: emailDec.retryAfter, rule, dimension: 'email' }
    }
  }
  return { allowed: true, retryAfter: 0, rule, dimension }
}

/** Test-only: clear all buckets. */
export function __resetRateLimitForTests(): void {
  storage.clear()
}

export function pickEmailFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const direct = (body as { email?: unknown }).email
  if (typeof direct === 'string' && direct.length > 0) return direct
  const args = (body as { args?: unknown }).args
  if (Array.isArray(args) && args.length > 0 && args[0] && typeof args[0] === 'object') {
    const fromArgs = (args[0] as { email?: unknown }).email
    if (typeof fromArgs === 'string' && fromArgs.length > 0) return fromArgs
  }
  return null
}
