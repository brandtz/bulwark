/**
 * server/utils/cors.ts — pure CORS decision
 * (W5-1 / EH-R / ADR-0035).
 *
 * # Decisions (ADR-0008, ADR-0035)
 *   - **Same-origin by default** — no `Access-Control-Allow-Origin`
 *     unless `BULWARK_CORS_ORIGINS` is set.
 *   - **Allowlist via comma-separated env**; the matched origin is
 *     echoed verbatim (never `*`) so credentialed XHR works.
 *   - **OPTIONS preflight short-circuit** is flagged here and
 *     executed by the h3 wrapper via `sendNoContent`.
 */
export const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
export const ALLOWED_HEADERS = 'Content-Type, Authorization, X-CSRF-Token'

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export interface CorsDecision {
  headers: Record<string, string>
  preflight: boolean
}

export interface CorsInput {
  origin: string | null
  method: string
  allowlist: string[]
}

export function decideCors(input: CorsInput): CorsDecision {
  const isPreflight = input.method.toUpperCase() === 'OPTIONS'
  if (!input.origin || input.allowlist.length === 0) {
    return { headers: {}, preflight: false }
  }
  if (!input.allowlist.includes(input.origin)) {
    return { headers: {}, preflight: false }
  }
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': input.origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    Vary: 'Origin',
  }
  return { headers, preflight: isPreflight }
}
