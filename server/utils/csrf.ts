/**
 * server/utils/csrf.ts — double-submit CSRF protection (WP-L07 S1, ADR-0006).
 *
 * # Decisions
 *   - Every response that lacks one sets a random `bulwark.csrf` cookie
 *     (readable by JS, SameSite=Lax). Unsafe `/api/**` requests that carry
 *     the session cookie must echo it in `X-CSRF-Token`; a cross-site page
 *     cannot read the cookie, so it cannot forge the header.
 *   - The token is required only for authenticated sessions (a signed-in
 *     user in the sealed session), which is where ambient authority exists.
 *     nuxt-auth-utils also issues an empty session cookie to anonymous
 *     visitors, so cookie presence alone is not the signal. Bearer-authenticated
 *     cron endpoints and signed dev upload URLs are exempt by construction.
 *   - Any unsafe API call whose Origin names another host is refused, signed
 *     in or not (covers login CSRF from a cross-site form post).
 *   - SSR renders call the API in-process with the browser's cookies but no
 *     header. They carry `X-Bulwark-Internal`, an HMAC of a server secret that
 *     never leaves the server, and are trusted.
 *   - Comparison is constant-time.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const CSRF_COOKIE = 'bulwark.csrf'
export const CSRF_HEADER = 'x-csrf-token'
export const INTERNAL_HEADER = 'x-bulwark-internal'

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const EXEMPT_PREFIXES = ['/api/_dev/uploads/']

export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

function serverSecret(): string {
  return process.env.NUXT_SESSION_PASSWORD || process.env.JWT_SECRET || 'dev-only-32char-min-replace-in-env'
}

/** Token that marks an in-process SSR request; derived, never sent to browsers. */
export function internalRequestToken(): string {
  return createHmac('sha256', serverSecret()).update('bulwark-ssr-internal-v1').digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export interface CsrfRequest {
  method: string
  path: string
  /** True when the sealed session carries a signed-in user. */
  authenticated: boolean
  cookies: Record<string, string | undefined>
  headers: Record<string, string | undefined>
}

function crossOrigin(headers: CsrfRequest['headers']): boolean {
  const origin = headers.origin
  if (!origin || origin === 'null') return origin === 'null'
  try {
    return new URL(origin).host !== headers.host
  } catch {
    return true
  }
}

export type CsrfDecision = { ok: true } | { ok: false, reason: string }

export function checkCsrf(req: CsrfRequest): CsrfDecision {
  if (!UNSAFE.has(req.method.toUpperCase())) return { ok: true }
  if (!req.path.startsWith('/api/')) return { ok: true }
  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return { ok: true }
  if (req.headers.authorization) return { ok: true }
  if (crossOrigin(req.headers)) return { ok: false, reason: 'Cross-origin request refused' }
  if (!req.authenticated) return { ok: true }
  const internal = req.headers[INTERNAL_HEADER]
  if (internal && safeEqual(internal, internalRequestToken())) return { ok: true }
  const cookie = req.cookies[CSRF_COOKIE]
  const header = req.headers[CSRF_HEADER]
  if (!cookie || !header) return { ok: false, reason: 'CSRF token missing' }
  if (!safeEqual(cookie, header)) return { ok: false, reason: 'CSRF token mismatch' }
  return { ok: true }
}
