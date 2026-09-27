/**
 * app/utils/csrf.ts — read the double-submit CSRF cookie (WP-L07 S1).
 * The server sets `bulwark.csrf` (readable, SameSite=Lax); unsafe API calls
 * echo it in `X-CSRF-Token`. See server/utils/csrf.ts.
 */
export const CSRF_COOKIE_NAME = 'bulwark.csrf'

export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${CSRF_COOKIE_NAME}=`
  const match = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

export function isUnsafeMethod(method: string | undefined): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase())
}
