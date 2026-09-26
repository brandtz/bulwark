import { afterEach, describe, expect, it } from 'vitest'
import { buildAuthLink, escapeEmailHtml } from '../../server/services/_providers/auth-links'

const previousNodeEnv = process.env.NODE_ENV
const previousAppUrl = process.env.BULWARK_APP_URL

afterEach(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
  if (previousAppUrl === undefined) delete process.env.BULWARK_APP_URL
  else process.env.BULWARK_APP_URL = previousAppUrl
})

describe('auth email links', () => {
  it('requires an explicit HTTPS production origin', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.BULWARK_APP_URL
    expect(buildAuthLink('/accept-invite', 'secret-token')).toBeNull()
    process.env.BULWARK_APP_URL = 'http://bulwark.example'
    expect(buildAuthLink('/reset-password', 'secret-token')).toBeNull()
  })

  it('builds canonical absolute links with encoded tokens', () => {
    process.env.NODE_ENV = 'production'
    process.env.BULWARK_APP_URL = 'https://bulwark.example/base/path?stale=1'
    expect(buildAuthLink('/reset-password', 'token with spaces')).toBe(
      'https://bulwark.example/reset-password?token=token+with+spaces',
    )
  })

  it('escapes email HTML values', () => {
    expect(escapeEmailHtml(`a&b <x> "q" 's'`)).toBe('a&amp;b &lt;x&gt; &quot;q&quot; &#39;s&#39;')
  })
})