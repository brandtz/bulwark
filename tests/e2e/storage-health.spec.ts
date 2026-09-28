/**
 * tests/e2e/storage-health.spec.ts — L01-S4 storage health endpoint (real backend).
 *
 * Permission gate + shape assertions for GET /api/health/storage:
 * 401 unauthenticated, 403 for a non-admin persona, and for an admin a full
 * payload — fs driver in dev (r2 on a built server), probe ok, and the legacy-asset census with the
 * avatar column included (no intentional-inline exemptions since L02-S3).
 */
import { test, expect } from '@playwright/test'
import { isBuiltServer, signIn, signOut } from './_helpers'

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

    // Dev runs the filesystem driver; a production build fails closed to r2 (S3 stand-in in CI).
    expect(body.driver).toBe(isBuiltServer() ? 'r2' : 'fs')
    expect(body.probe.ok).toBe(true)
    expect(body.probe.latencyMs).toBeGreaterThanOrEqual(0)

    // Census covers every guarded asset column including the avatar column
    // (on storage since L02-S3); counts are non-negative integers.
    const keys = body.legacyAssets.map((r: { table: string; column: string }) => `${r.table}.${r.column}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        'property_photos.url',
        'property_photos.thumbnail_url',
        'property_attachments.url',
        'org_branding.logo_url',
        'subcontractor_coi_docs.file_url',
        'deliverables.result_url',
        'users.avatar_url',
      ]),
    )
    for (const row of body.legacyAssets) {
      expect(Number.isInteger(row.count)).toBe(true)
      expect(row.count).toBeGreaterThanOrEqual(0)
      expect(row.intentionalInline).toBe(false)
    }
  })
})
