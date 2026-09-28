/**
 * tests/integration/asset-scan.real.test.ts — WP-X3 async scan end to end
 * (ED-00E) against Postgres + the fs storage driver, with a fake scanner.
 *
 * clean → row clean; infected → object moved to quarantine/, row infected,
 * org admins notified; reads withhold pending assets from non-uploaders and
 * infected ones from everybody; processing is idempotent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, memberships, notifications, organizations, properties, propertyPhotos, users } from '../../server/db/schema'
import { getStorage } from '../../server/services/storage'
import { buildStorageKey } from '../../server/services/storage/keys'
import { processAssetScan } from '../../server/services/storage/asset-scan'
import { ASSET_UNAVAILABLE_URL } from '../../server/services/storage/asset-urls'
import type { ScanDriver } from '../../server/services/_providers/scan'
import { RealPropertyPhotoService } from '../../server/services/property-photo.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const clean: ScanDriver = { name: 'clamav', scan: async () => ({ clean: true }) }
const infected: ScanDriver = { name: 'clamav', scan: async () => ({ clean: false, signature: 'Eicar-Test-Signature' }) }

d('async asset scan (WP-X3 / ED-00E)', () => {
  let orgId: string
  let uploaderId: string
  let adminId: string
  let propertyId: string

  async function pendingPhoto(): Promise<{ id: string, key: string }> {
    const key = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    await getStorage().putObject({ key, body: Buffer.from('not really a png'), contentType: 'image/png' })
    const [row] = await getDb().insert(propertyPhotos).values({ organizationId: orgId, propertyId, url: key, uploadedByUserId: uploaderId, scanStatus: 'pending' }).returning()
    return { id: row!.id, key }
  }

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'X3 scan', slug: `x3-scan-${stamp}` }).returning()
    orgId = o!.id
    const hash = await bcrypt.hash('x', 4)
    const [u] = await db.insert(users).values({ email: `x3-up-${stamp}@x.test`, fullName: 'Up', passwordHash: hash, isActive: true }).returning()
    const [a] = await db.insert(users).values({ email: `x3-admin-${stamp}@x.test`, fullName: 'Admin', passwordHash: hash, isActive: true }).returning()
    uploaderId = u!.id
    adminId = a!.id
    await db.insert(memberships).values([
      { userId: uploaderId, organizationId: orgId, role: 'field' },
      { userId: adminId, organizationId: orgId, role: 'org_admin' },
    ])
    const [p] = await db.insert(properties).values({ organizationId: orgId, addressLine1: 'S', city: 'C', state: 'CA', postalCode: '0' }).returning()
    propertyId = p!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(notifications).where(eq(notifications.organizationId, orgId))
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(propertyPhotos).where(eq(propertyPhotos.organizationId, orgId))
    await db.delete(properties).where(eq(properties.organizationId, orgId))
    await db.delete(memberships).where(eq(memberships.organizationId, orgId))
    await db.delete(users).where(inArray(users.id, [uploaderId, adminId]))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const as = (userId: string) => new RealPropertyPhotoService(() => ({ organizationId: orgId, userId }))

  it('withholds a pending photo from everyone but its uploader', async () => {
    const { id } = await pendingPhoto()
    const mine = (await as(uploaderId).listForProperty(propertyId, orgId)).find((p) => p.id === id)!
    const theirs = (await as(adminId).listForProperty(propertyId, orgId)).find((p) => p.id === id)!
    expect(mine.scanStatus).toBe('pending')
    expect(mine.url).not.toBe(ASSET_UNAVAILABLE_URL)
    expect(theirs.url).toBe(ASSET_UNAVAILABLE_URL)
  })

  it('clean scan clears the photo for everyone; re-processing is a no-op', async () => {
    const { id } = await pendingPhoto()
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, clean)).resolves.toEqual({ status: 'clean' })
    const seen = (await as(adminId).listForProperty(propertyId, orgId)).find((p) => p.id === id)!
    expect(seen.scanStatus).toBe('clean')
    expect(seen.url).not.toBe(ASSET_UNAVAILABLE_URL)
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)).resolves.toEqual({ status: 'clean' })
  })

  it('infected scan quarantines the object, blocks it for all, and notifies org admins', async () => {
    const { id, key } = await pendingPhoto()
    const out = await processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)
    expect(out).toMatchObject({ status: 'infected', signature: 'Eicar-Test-Signature', quarantinedAt: `quarantine/${key}` })
    expect((await getStorage().headObject(key)).exists).toBe(false)

    const byUploader = (await as(uploaderId).listForProperty(propertyId, orgId)).find((p) => p.id === id)!
    expect(byUploader.scanStatus).toBe('infected')
    expect(byUploader.url).toBe(ASSET_UNAVAILABLE_URL)

    const alerts = await getDb().select().from(notifications)
      .where(and(eq(notifications.organizationId, orgId), eq(notifications.eventType, 'asset.quarantined')))
    expect(alerts.map((n) => n.userId)).toEqual([adminId])
    expect(alerts[0]!.severity).toBe('error')
  })

  it('a scanner failure leaves the photo pending (the job retries)', async () => {
    const { id } = await pendingPhoto()
    const broken: ScanDriver = { name: 'clamav', scan: async () => { throw new Error('clamd: timeout') } }
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, broken)).rejects.toThrow('clamd: timeout')
    const [row] = await getDb().select().from(propertyPhotos).where(eq(propertyPhotos.id, id))
    expect(row!.scanStatus).toBe('pending')
  })
})
