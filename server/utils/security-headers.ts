/**
 * server/utils/security-headers.ts — pure header builder
 * (W5-1 / EH-R / ADR-0035).
 *
 * # Decisions (ADR-0008, ADR-0035)
 *   - **No `helmet` dep**. Set ~8 headers by hand via
 *     `setResponseHeaders` from the middleware.
 *   - **HSTS gated on production** (or `BULWARK_FORCE_HSTS=1`) so
 *     dev / Playwright on http://localhost don't pin the browser.
 *   - **CSP only for HTML responses**. API JSON skips CSP — the
 *     middleware decides via path prefix.
 *   - **`'unsafe-inline'` in script/style** accepted Phase 1 for
 *     Nuxt SSR hydration + Tailwind. Nonce-based CSP is the Phase 2
 *     upgrade path (see ADR-0035 §Rejected).
 *   - **`Permissions-Policy` keeps geolocation=(self)** for field
 *     check-ins; everything else is `()`.
 *   - **`BULWARK_CSP_REPORT_ONLY=1`** flips the header name to
 *     `Content-Security-Policy-Report-Only` for staging ratchet.
 */
export interface HeaderEnv {
  nodeEnv?: string
  forceHsts?: string
  cspReportOnly?: string
}

export const CSP_DIRECTIVES: ReadonlyArray<[string, string]> = [
  ['default-src', "'self'"],
  ['script-src', "'self' 'unsafe-inline'"],
  ['style-src', "'self' 'unsafe-inline'"],
  ['img-src', "'self' data: blob:"],
  ['connect-src', "'self'"],
  ['font-src', "'self' data:"],
  ['frame-ancestors', "'none'"],
  ['base-uri', "'self'"],
  ['form-action', "'self'"],
]

export function buildCspValue(): string {
  return CSP_DIRECTIVES.map(([k, v]) => `${k} ${v}`).join('; ')
}

export interface SecurityHeaderOptions {
  isHtml: boolean
  env?: HeaderEnv
}

function readHeaderEnv(): HeaderEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    forceHsts: process.env.BULWARK_FORCE_HSTS,
    cspReportOnly: process.env.BULWARK_CSP_REPORT_ONLY,
  }
}

export function buildSecurityHeaders(opts: SecurityHeaderOptions): Record<string, string> {
  const env = opts.env ?? readHeaderEnv()
  const out: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
    'X-DNS-Prefetch-Control': 'off',
  }
  if (env.nodeEnv === 'production' || env.forceHsts === '1') {
    out['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
  }
  if (opts.isHtml) {
    const headerName =
      env.cspReportOnly === '1'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy'
    out[headerName] = buildCspValue()
  }
  return out
}

export function isHtmlPath(path: string): boolean {
  if (path.startsWith('/api/')) return false
  if (path === '/_nuxt' || path.startsWith('/_nuxt/')) return false
  if (/\.(?:js|css|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|json|xml|txt)$/iu.test(path)) {
    return false
  }
  return true
}
