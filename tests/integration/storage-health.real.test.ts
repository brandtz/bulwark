/**
 * tests/integration/storage-health.real.test.ts — L01-S4 legacy census SQL.
 *
 * Needs a real Postgres (auto-skips without DATABASE_URL, same carve-out as
 * the other *.real tests). Seeds an org with a mix of placeholder and clean
 * asset rows, runs `countLegacyAssetRows`, and asserts the census counts
 * exactly the placeholders — including the RFC 2397 edge cases (uppercase
 * `DATA:`, leading whitespace) and soft-deleted-row exclusion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'
import {
  organizations,
  propertyAttachments,
  propertyPhotos,
} from '../../server/db/schema'
import { countLegacyAssetRows } from '../../server/services/storage/legacy-report'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const PROP_ID = '00000000-0000-4000-8000-0000000000f1'

d('countLegacyAssetRows (L01-S4)', () => {
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'L01-S4 Census Org',
        slug: `l01s4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      .returning()
    orgId = org!.id

    await db.insert(propertyPhotos).values([
      // 3 placeholders: plain, uppercase scheme, leading whitespace.
      { organizationId: orgId, propertyId: PROP_ID, url: 'data:image/png;base64,AAAA' },
      { organizationId: orgId, propertyId: PROP_ID, url: 'DATA:image/png;base64,BBBB' },
      { organizationId: orgId, propertyId: PROP_ID, url: '  local://photos/legacy.png' },
      // Clean row — a real storage key persisted post-L02 must NOT count.
      {
        organizationId: orgId,
        propertyId: PROP_ID,
        url: `${orgId}/property_photo/${PROP_ID}/00000000-0000-4000-8000-0000000000aa.jpg`,
      },
      // Placeholder thumbnail on a clean primary URL: counts for thumbnail only.
      {
        organizationId: orgId,
        propertyId: PROP_ID,
        url: 'https://cdn.example.com/photo.jpg',
        thumbnailUrl: 'blob:https://app.example.com/12345',
      },
      // Soft-deleted placeholder must NOT count.
      {
        organizationId: orgId,
        propertyId: PROP_ID,
        url: 'data:image/png;base64,DEAD',
        deletedAt: new Date(),
      },
    ])

    await db.insert(propertyAttachments).values([
      { organizationId: orgId, propertyId: PROP_ID, name: 'legacy plat', url: 'local://plat.pdf' },
      {
        organizationId: orgId,
        propertyId: PROP_ID,
        name: 'clean survey',
        url: 'https://cdn.example.com/survey.pdf',
      },
    ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(propertyPhotos).where(eq(propertyPhotos.organizationId, orgId))
    await db.delete(propertyAttachments).where(eq(propertyAttachments.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await closeDb()
  })

  it('counts placeholders per column, excluding clean + soft-deleted rows', async () => {
    const census = await countLegacyAssetRows(orgId)
    const byKey = Object.fromEntries(census.map((c) => [`${c.table}.${c.column}`, c.count]))

    expect(byKey['property_photos.url']).toBe(3)
    expect(byKey['property_photos.thumbnail_url']).toBe(1)
    expect(byKey['property_attachments.url']).toBe(1)
    expect(byKey['org_branding.logo_url']).toBe(0)
    expect(byKey['subcontractor_coi_docs.file_url']).toBe(0)
    expect(byKey['deliverables.result_url']).toBe(0)
    expect(byKey['users.avatar_url']).toBe(0)
  })

  it('reports every column as real migration debt (avatars moved to storage in L02-S3)', async () => {
    const census = await countLegacyAssetRows(orgId)
    for (const row of census) {
      expect(row.intentionalInline).toBe(false)
    }
  })

  it('is tenant-scoped: a different org sees zero', async () => {
    const db = getDb()
    const [other] = await db
      .insert(organizations)
      .values({
        name: 'L01-S4 Other Org',
        slug: `l01s4b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      .returning()
    try {
      const census = await countLegacyAssetRows(other!.id)
      expect(census.every((c) => c.count === 0)).toBe(true)
    } finally {
      await db.delete(organizations).where(eq(organizations.id, other!.id))
    }
  })
})
