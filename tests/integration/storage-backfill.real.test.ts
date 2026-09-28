/**
 * tests/integration/storage-backfill.real.test.ts — WP-L02-S5 backfill + the
 * owning-service key checks it relies on.
 *
 * Needs a real Postgres (auto-skips without DATABASE_URL). Uses the fs storage
 * driver (dev default). Seeds one org with legacy rows, dry-runs (no writes),
 * applies (data: → key, stubs dropped), re-runs (0 found: idempotent), and
 * checks `assertOwnedAssetKey` / `signAssetUrl` against the migrated key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'
import { organizations, orgBranding, propertyAttachments, propertyPhotos } from '../../server/db/schema'
import { runAssetBackfill, decodeDataUrl } from '../../server/services/storage/backfill'
import { assertOwnedAssetKey, isStorageKey, signAssetUrl } from '../../server/services/storage/asset-urls'
import { countLegacyAssetRows } from '../../server/services/storage/legacy-report'
import { getStorage } from '../../server/services/storage'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const PROP_ID = '00000000-0000-4000-8000-0000000000f2'
// 1×1 transparent PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

d('runAssetBackfill (WP-L02-S5)', () => {
  let orgId: string
  let otherOrgId: string

  beforeAll(async () => {
    const db = getDb()
    const mk = async (name: string) => {
      const [org] = await db.insert(organizations).values({
        name,
        slug: `l02s5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }).returning()
      return org!.id
    }
    orgId = await mk('L02-S5 Backfill Org')
    otherOrgId = await mk('L02-S5 Other Org')

    await db.insert(propertyPhotos).values([
      { organizationId: orgId, propertyId: PROP_ID, url: `data:image/png;base64,${PNG_B64}`, caption: 'inline' },
      { organizationId: orgId, propertyId: PROP_ID, url: 'local://photos/legacy.png', caption: 'stub' },
      { organizationId: orgId, propertyId: PROP_ID, url: 'https://cdn.example.com/ok.jpg', thumbnailUrl: 'blob:https://x/1', caption: 'clean' },
    ])
    await db.insert(propertyAttachments).values([
      { organizationId: orgId, propertyId: PROP_ID, name: 'gif', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
    ])
    await db.insert(orgBranding).values({ organizationId: orgId, logoUrl: `data:image/png;base64,${PNG_B64}` })
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(propertyPhotos).where(eq(propertyPhotos.organizationId, orgId))
    await db.delete(propertyAttachments).where(eq(propertyAttachments.organizationId, orgId))
    await db.delete(orgBranding).where(eq(orgBranding.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(organizations).where(eq(organizations.id, otherOrgId))
    await closeDb()
  })

  it('decodes base64 and percent-encoded data: URLs', () => {
    expect(decodeDataUrl(`data:image/png;base64,${PNG_B64}`)?.contentType).toBe('image/png')
    expect(decodeDataUrl('DATA:text/plain,hi%20there')?.body.toString()).toBe('hi there')
    expect(decodeDataUrl('https://example.com/x.png')).toBeNull()
  })

  it('dry-run counts without writing', async () => {
    const reports = await runAssetBackfill({ apply: false, organizationId: orgId })
    const by = Object.fromEntries(reports.map((r) => [`${r.table}.${r.column}`, r]))
    expect(by['property_photos.url']).toMatchObject({ found: 2, migrated: 1, dropped: 1 })
    expect(by['property_photos.thumbnail_url']).toMatchObject({ found: 1, migrated: 0, dropped: 1 })
    expect(by['property_attachments.url']).toMatchObject({ found: 1, migrated: 0, dropped: 1 })
    expect(by['org_branding.logo_url']).toMatchObject({ found: 1, migrated: 1, dropped: 0 })
    const again = await runAssetBackfill({ apply: false, organizationId: orgId })
    expect(again.reduce((n, r) => n + r.found, 0)).toBe(5)
  })

  it('apply re-homes data: rows, drops stubs, and a re-run finds nothing', async () => {
    await runAssetBackfill({ apply: true, organizationId: orgId })
    const db = getDb()
    const live = await db.select().from(propertyPhotos)
      .where(and(eq(propertyPhotos.organizationId, orgId), isNull(propertyPhotos.deletedAt)))
    const inline = live.find((p) => p.caption === 'inline')!
    expect(isStorageKey(inline.url)).toBe(true)
    expect(inline.url.startsWith(`${orgId}/property_photo/${PROP_ID}/`)).toBe(true)
    expect((await getStorage().headObject(inline.url)).exists).toBe(true)
    expect(live.find((p) => p.caption === 'stub')).toBeUndefined() // soft-deleted
    expect(live.find((p) => p.caption === 'clean')!.thumbnailUrl).toBeNull()

    const [att] = await db.select().from(propertyAttachments).where(eq(propertyAttachments.organizationId, orgId))
    expect(att!.deletedAt).not.toBeNull() // gif is not an allowed attachment type

    const [brand] = await db.select().from(orgBranding).where(eq(orgBranding.organizationId, orgId))
    expect(isStorageKey(brand!.logoUrl)).toBe(true)

    const rerun = await runAssetBackfill({ apply: true, organizationId: orgId })
    expect(rerun.reduce((n, r) => n + r.found, 0)).toBe(0)
    const census = await countLegacyAssetRows(orgId)
    const l02 = census.filter((c) => ['property_photos', 'property_attachments', 'org_branding', 'users'].includes(c.table))
    expect(l02.every((c) => c.count === 0)).toBe(true)
  })

  it('owning-service key checks: tenant, entity kind and existence', async () => {
    const db = getDb()
    const [row] = await db.select().from(propertyPhotos)
      .where(and(eq(propertyPhotos.organizationId, orgId), eq(propertyPhotos.caption, 'inline')))
    const key = row!.url

    await expect(assertOwnedAssetKey(key, orgId, 'property_photo')).resolves.toBeUndefined()
    await expect(assertOwnedAssetKey(key, otherOrgId, 'property_photo')).rejects.toThrow(/another organization/)
    await expect(assertOwnedAssetKey(key, orgId, 'property_attachment')).rejects.toThrow(/expected a property_attachment/)
    const missing = `${orgId}/property_photo/${PROP_ID}/00000000-0000-4000-8000-00000000dead.png`
    await expect(assertOwnedAssetKey(missing, orgId, 'property_photo')).rejects.toThrow(/not found/)

    const signed = await signAssetUrl(key)
    expect(signed).not.toBe(key)
    expect(signed).toMatch(/sig=/)
    expect(await signAssetUrl('https://cdn.example.com/ok.jpg')).toBe('https://cdn.example.com/ok.jpg')
    expect(await signAssetUrl(null)).toBeNull()
  })
})
