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
 *   - **Object-storage origin in img-src + connect-src** (WP-L02). Browsers
 *     PUT uploads straight to presigned R2 URLs and render signed GET URLs,
 *     both cross-origin. Only the configured bucket origin is added (derived
 *     from R2_ENDPOINT / R2_ACCOUNT_ID / R2_BUCKET), not a wildcard.
 */
export interface HeaderEnv {
  nodeEnv?: string
  forceHsts?: string
  cspReportOnly?: string
  r2Endpoint?: string
  r2AccountId?: string
  r2Bucket?: string
  r2ForcePathStyle?: string
}

export const CSP_DIRECTIVES: ReadonlyArray<[string, string]> = [
  ['default-src', "'self'"],
  ['script-src', "'self' 'unsafe-inline'"],
  ['style-src', "'self' 'unsafe-inline'"],
  // WP-X3 / ED-00C: Mapbox Static Images render in <img> (geo is server-side otherwise).
  ['img-src', "'self' data: blob: https://api.mapbox.com"],
  ['connect-src', "'self'"],
  ['font-src', "'self' data:"],
  ['frame-ancestors', "'none'"],
  ['base-uri', "'self'"],
  ['form-action', "'self'"],
]

/**
 * Origins the browser talks to for object storage: the endpoint itself (path-style
 * URLs) and, unless path-style is forced, the bucket virtual host the S3 client
 * presigns against. Empty when storage is not configured (fs driver = same origin).
 */
export function storageOrigins(env: HeaderEnv): string[] {
  const endpoint = env.r2Endpoint || (env.r2AccountId ? `https://${env.r2AccountId}.r2.cloudflarestorage.com` : '')
  if (!endpoint) return []
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return []
  }
  const out = [url.origin]
  if (env.r2Bucket && env.r2ForcePathStyle !== '1') out.push(`${url.protocol}//${env.r2Bucket}.${url.host}`)
  return out
}

export function buildCspValue(extraStorageOrigins: readonly string[] = []): string {
  const extra = extraStorageOrigins.length ? ' ' + extraStorageOrigins.join(' ') : ''
  return CSP_DIRECTIVES
    .map(([k, v]) => `${k} ${k === 'img-src' || k === 'connect-src' ? v + extra : v}`)
    .join('; ')
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
    r2Endpoint: process.env.R2_ENDPOINT,
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2Bucket: process.env.R2_BUCKET,
    r2ForcePathStyle: process.env.R2_FORCE_PATH_STYLE,
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
    out[headerName] = buildCspValue(storageOrigins(env))
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

/**
 * WP-L08 / L10-S4: cache policy for dynamic responses. Platform defaults sent
 * `public, max-age=0, must-revalidate`, which lets a shared cache store signed-in
 * pages and API JSON. API responses are never stored; HTML may be kept by the
 * browser but must be revalidated. Hashed `/_nuxt/*` assets keep the platform's
 * `immutable` header (returns undefined for them).
 */
export function cacheControlFor(path: string): string | undefined {
  if (path.startsWith('/api/')) return 'private, no-store'
  if (isHtmlPath(path)) return 'private, no-cache'
  return undefined
}
