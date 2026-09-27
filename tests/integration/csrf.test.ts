/** WP-L07 S1 — double-submit CSRF + Origin policy (server/utils/csrf.ts). */
import { describe, expect, it } from 'vitest'
import { checkCsrf, internalRequestToken, newCsrfToken, type CsrfRequest } from '../../server/utils/csrf'

const token = newCsrfToken()
const signedIn = (over: Partial<CsrfRequest> = {}): CsrfRequest => ({
  method: 'POST',
  path: '/api/services/user/invite',
  authenticated: true,
  cookies: { 'nuxt-session': 'sealed', 'bulwark.csrf': token },
  headers: { host: 'app.example' },
  ...over,
})

describe('checkCsrf', () => {
  it('accepts a signed-in unsafe request that echoes the cookie', () => {
    expect(checkCsrf(signedIn({ headers: { 'host': 'app.example', 'x-csrf-token': token } }))).toEqual({ ok: true })
    expect(checkCsrf(signedIn({ headers: { 'host': 'app.example', 'origin': 'https://app.example', 'x-csrf-token': token } }))).toEqual({ ok: true })
  })

  it('rejects a missing or mismatched header for a signed-in session', () => {
    expect(checkCsrf(signedIn())).toEqual({ ok: false, reason: 'CSRF token missing' })
    expect(checkCsrf(signedIn({ headers: { 'host': 'app.example', 'x-csrf-token': newCsrfToken() } }))).toEqual({ ok: false, reason: 'CSRF token mismatch' })
    expect(checkCsrf(signedIn({ cookies: { 'nuxt-session': 'sealed' }, headers: { 'host': 'app.example', 'x-csrf-token': token } })))
      .toEqual({ ok: false, reason: 'CSRF token missing' })
  })

  it('covers every unsafe method but not safe ones', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'post']) expect(checkCsrf(signedIn({ method })).ok).toBe(false)
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(checkCsrf(signedIn({ method })).ok).toBe(true)
  })

  it('refuses cross-origin unsafe calls even when anonymous (login CSRF)', () => {
    const anon = { authenticated: false, cookies: {}, path: '/api/services/auth/login' }
    expect(checkCsrf(signedIn({ ...anon, headers: { host: 'app.example', origin: 'https://evil.example' } })))
      .toEqual({ ok: false, reason: 'Cross-origin request refused' })
    expect(checkCsrf(signedIn({ ...anon, headers: { host: 'app.example', origin: 'null' } })).ok).toBe(false)
    expect(checkCsrf(signedIn({ ...anon, headers: { host: 'app.example', origin: 'https://app.example' } })).ok).toBe(true)
  })

  it('does not demand a token from anonymous visitors, even with an empty session cookie', () => {
    expect(checkCsrf(signedIn({ authenticated: false, headers: { host: 'app.example' } })).ok).toBe(true)
  })

  it('exempts bearer calls, non-API paths and signed dev uploads', () => {
    expect(checkCsrf(signedIn({ headers: { host: 'app.example', authorization: 'Bearer cron-secret' } })).ok).toBe(true)
    expect(checkCsrf(signedIn({ path: '/login' })).ok).toBe(true)
    expect(checkCsrf(signedIn({ path: '/api/_dev/uploads/key.png', method: 'PUT' })).ok).toBe(true)
  })

  it('trusts only the exact server-derived SSR token', () => {
    expect(checkCsrf(signedIn({ headers: { 'host': 'app.example', 'x-bulwark-internal': internalRequestToken() } })).ok).toBe(true)
    expect(checkCsrf(signedIn({ headers: { 'host': 'app.example', 'x-bulwark-internal': 'guess' } })).ok).toBe(false)
  })
})
