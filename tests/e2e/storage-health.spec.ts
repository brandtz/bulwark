/**
 * tests/e2e/storage-health.spec.ts — L01-S4 storage health endpoint (real backend).
 *
 * Permission gate + shape assertions for GET /api/health/storage:
 * 401 unauthenticated, 403 for a non-admin persona, and for an admin a full
 * payload — fs driver in dev, probe ok, and the legacy-asset census with the
 * avatars row flagged intentional-inline.
 */
import { test, expect } from '@playwright/test'
import { signIn, signOut } from './_helpers'

const BASE = 'http://localhost:3000'

test.describe('storage health (L01-S4)', () => {
  test('rejects an unauthenticated read with 401', async ({ context }) => {
    await signOut(context)
    const res = await context.request.get(`${BASE}/api/health/storage`)
    expect(res.status()).toBe(401)
  })

  test('rejects a field (non-admin) persona with 403', async ({ context }) => {
    await signIn(context, 'matthew@bulwark.demo')
    const res = await context.request.get(`${BASE}/api/health/storage`)
    expect(res.status()).toBe(403)
  })

  test('returns driver, probe, and legacy census for an org admin', async ({ context }) => {
    await signIn(context, 'drew@bulwark.demo')
    const res = await context.request.get(`${BASE}/api/health/storage`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()

    // Dev/test always runs the filesystem driver (prod fails closed to r2).
    expect(body.driver).toBe('fs')
    expect(body.probe.ok).toBe(true)
    expect(body.probe.latencyMs).toBeGreaterThanOrEqual(0)

    // Census covers every guarded asset column plus the intentional-inline
    // avatar column; counts are non-negative integers.
    const keys = body.legacyAssets.map((r: { table: string; column: string }) => `${r.table}.${r.column}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        'property_photos.url',
        'property_photos.thumbnail_url',
        'property_attachments.url',
        'org_branding.logo_url',
        'subcontractor_coi_docs.file_url',
        'compliance_docs.result_url',
        'users.avatar_url',
      ]),
    )
    for (const row of body.legacyAssets) {
      expect(Number.isInteger(row.count)).toBe(true)
      expect(row.count).toBeGreaterThanOrEqual(0)
      expect(row.intentionalInline).toBe(row.table === 'users')
    }
  })
})
