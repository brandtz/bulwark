/**
 * tests/unit/r2-signing.test.ts — WP-L08 / L10-S4 cacheable signed downloads.
 *
 * Signing is local (no network): the same object must get the same URL for a
 * whole 30-minute window (so the browser cache works), a new one in the next
 * window, and the response must be marked private + immutable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { R2Driver } from '~~/server/services/storage/r2-driver'

const ENV = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'AKIDEXAMPLE', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket' }
const KEY = '00000000-0000-4000-8000-000000000001/property_photo/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.png'

describe('R2 signed download URLs (WP-L08 / L10-S4)', () => {
  const saved: Record<string, string | undefined> = {}
  beforeAll(() => {
    for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v }
    vi.useFakeTimers()
  })
  afterAll(() => {
    vi.useRealTimers()
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k)
      else process.env[k] = v
    }
  })

  it('is stable within a window, rotates across windows, and is browser-cacheable', async () => {
    const driver = new R2Driver()
    vi.setSystemTime(new Date('2026-09-28T10:05:00Z'))
    const a = await driver.getSignedDownloadUrl({ key: KEY, expiresInSeconds: 3600 })
    vi.setSystemTime(new Date('2026-09-28T10:25:00Z')) // same 10:00–10:30 window
    const b = await driver.getSignedDownloadUrl({ key: KEY, expiresInSeconds: 3600 })
    vi.setSystemTime(new Date('2026-09-28T10:35:00Z')) // next window
    const c = await driver.getSignedDownloadUrl({ key: KEY, expiresInSeconds: 3600 })

    expect(b.url).toBe(a.url)
    expect(c.url).not.toBe(a.url)
    const u = new URL(a.url)
    expect(u.searchParams.get('response-cache-control')).toBe('private, max-age=3600, immutable')
    expect(u.searchParams.get('X-Amz-Date')).toBe('20260928T100000Z')
    // Valid for at least the requested TTL from any moment in the window.
    expect(Number(u.searchParams.get('X-Amz-Expires'))).toBe(3600 + 1800)
    expect(a.expiresAt).toBe('2026-09-28T11:30:00.000Z')
  })
})
