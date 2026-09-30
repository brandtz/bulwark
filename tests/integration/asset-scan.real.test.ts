/**
 * tests/integration/asset-scan.real.test.ts — WP-X3 async scan end to end
 * (ED-00E) against Postgres + the fs storage driver, with a fake scanner.
 *
 * clean → row clean; infected → object moved to quarantine/, row infected,
 * org admins notified; reads withhold pending assets from non-uploaders and
 * infected ones from everybody; processing is idempotent.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { auditLog, jobs, memberships, notifications, organizations, properties, propertyPhotos, users } from '../../server/db/schema'
import { getStorage } from '../../server/services/storage'
import { buildStorageKey } from '../../server/services/storage/keys'
import { processAssetScan } from '../../server/services/storage/asset-scan'
import { ASSET_UNAVAILABLE_URL } from '../../server/services/storage/asset-urls'
import type { ScanDriver } from '../../server/services/_providers/scan'
import { RealPropertyPhotoService } from '../../server/services/property-photo.real'
import { RealPropertyService } from '../../server/services/property.real'
import { RealScanService } from '../../server/services/scan.real'
import { TenantViolationError } from '../../server/services/_tenant'

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
    await db.delete(jobs).where(eq(jobs.organizationId, orgId))
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

  it('an unreadable object is failed (withheld), never skipped', async () => {
    const { id, key } = await pendingPhoto()
    await getStorage().deleteObject(key)
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, clean)).resolves.toEqual({ status: 'failed' })
    const theirs = (await as(adminId).listForProperty(propertyId, orgId)).find((p) => p.id === id)!
    expect(theirs.scanStatus).toBe('failed')
    expect(theirs.url).toBe(ASSET_UNAVAILABLE_URL)
  })

  it('an infected thumbnail quarantines the photo and the thumbnail', async () => {
    const { id, key } = await pendingPhoto()
    const thumb = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    await getStorage().putObject({ key: thumb, body: Buffer.from('EVIL'), contentType: 'image/png' })
    await getDb().update(propertyPhotos).set({ thumbnailUrl: thumb }).where(eq(propertyPhotos.id, id))
    const onlyThumbBad: ScanDriver = { name: 'clamav', scan: async (b) => (b.toString() === 'EVIL' ? { clean: false, signature: 'Thumb.Bad' } : { clean: true }) }
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, onlyThumbBad)).resolves.toMatchObject({ status: 'infected', signature: 'Thumb.Bad' })
    expect((await getStorage().headObject(key)).exists).toBe(false)
    expect((await getStorage().headObject(thumb)).exists).toBe(false)
  })

  it('a verdict is final: processing an infected row again cannot clear it', async () => {
    const { id } = await pendingPhoto()
    await processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, clean)).resolves.toEqual({ status: 'infected' })
  })

  it('scans an uploaded thumbnail even when the primary photo is an external URL', async () => {
    const { id, key } = await pendingPhoto()
    await getDb().update(propertyPhotos).set({ url: 'https://example.com/photo.png', thumbnailUrl: key }).where(eq(propertyPhotos.id, id))
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)).resolves.toMatchObject({ status: 'infected' })
    expect((await getStorage().headObject(key)).exists).toBe(false)
    expect(await as(adminId).get(id, orgId)).toMatchObject({ scanStatus: 'infected', url: ASSET_UNAVAILABLE_URL, thumbnailUrl: null })
  })

  it('rescan refuses quarantined/deleted/foreign assets and can recover a stuck pending scan', async () => {
    const svc = new RealScanService(() => ({ organizationId: orgId, userId: adminId }), () => clean)
    const bad = await pendingPhoto()
    await processAssetScan({ organizationId: orgId, entity: 'property_photo', id: bad.id }, infected)
    await expect(svc.rescan({ organizationId: orgId, entity: 'property_photo', id: bad.id })).rejects.toThrow(/quarantined/u)

    const ok = await pendingPhoto()
    await processAssetScan({ organizationId: orgId, entity: 'property_photo', id: ok.id }, clean)
    const jobsBefore = (await getDb().select().from(jobs).where(eq(jobs.organizationId, orgId))).length
    await expect(svc.rescan({ organizationId: orgId, entity: 'property_photo', id: ok.id })).resolves.toEqual({ status: 'pending' })
    await expect(svc.rescan({ organizationId: orgId, entity: 'property_photo', id: ok.id })).resolves.toEqual({ status: 'pending' })
    const queued = (await getDb().select().from(jobs).where(eq(jobs.organizationId, orgId))).filter((j) => j.kind === 'asset_scan')
    expect(queued.length - jobsBefore).toBe(2)
    expect(queued.some((j) => (j.payload as { id?: string }).id === ok.id)).toBe(true)

    const gone = await pendingPhoto()
    await getDb().update(propertyPhotos).set({ deletedAt: new Date() }).where(eq(propertyPhotos.id, gone.id))
    await expect(svc.rescan({ organizationId: orgId, entity: 'property_photo', id: gone.id })).rejects.toThrow(/not found/u)

    await expect(svc.rescan({ organizationId: randomUUID(), entity: 'property_photo', id: ok.id })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(svc.status(randomUUID())).rejects.toBeInstanceOf(TenantViolationError)
    const none = new RealScanService(() => ({ organizationId: orgId, userId: adminId }), () => ({ name: 'none', scan: async () => ({ clean: true }) }))
    await expect(none.rescan({ organizationId: orgId, entity: 'property_photo', id: ok.id })).rejects.toThrow(/no scanner/u)
  }, 15_000) // several DB round trips plus a queued rescan; slow under a loaded runner

  it('retries partial quarantine without exposing the infected thumbnail', async () => {
    const { id, key } = await pendingPhoto()
    const thumb = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    const storage = getStorage()
    await storage.putObject({ key: thumb, body: Buffer.from('EVIL'), contentType: 'image/png' })
    await getDb().update(propertyPhotos).set({ thumbnailUrl: thumb }).where(eq(propertyPhotos.id, id))
    const move = storage.quarantineObject.bind(storage)
    const fault = vi.spyOn(storage, 'quarantineObject').mockImplementation(async (k) => {
      if (k === thumb) throw new Error('temporary storage failure')
      return move(k)
    })
    try {
      await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)).rejects.toThrow('temporary storage failure')
      expect((await storage.headObject(key)).exists).toBe(false)
      const hidden = await as(uploaderId).get(id, orgId)
      expect(hidden).toMatchObject({ scanStatus: 'infected', url: ASSET_UNAVAILABLE_URL, thumbnailUrl: null })
    } finally { fault.mockRestore() }
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, clean)).resolves.toMatchObject({ status: 'infected' })
    expect((await storage.headObject(thumb)).exists).toBe(false)
  })

  it('thumbnail replacement is validated and an old scan cannot approve the replacement', async () => {
    const { id } = await pendingPhoto()
    const thumb = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    await getStorage().putObject({ key: thumb, body: Buffer.from('EVIL'), contentType: 'image/png' })
    const saved = process.env.CLAMD_HOST
    process.env.CLAMD_HOST = '127.0.0.1:3310'
    try {
      const replacedDuringScan: ScanDriver = { name: 'clamav', scan: async () => {
        await as(uploaderId).update({ id, organizationId: orgId, thumbnailUrl: thumb })
        return { clean: true }
      } }
      await processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, replacedDuringScan)
      const hidden = await as(adminId).get(id, orgId)
      expect(hidden).toMatchObject({ scanStatus: 'pending', url: ASSET_UNAVAILABLE_URL, thumbnailUrl: null })
      await processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, infected)
      await expect(as(uploaderId).update({ id, organizationId: orgId, thumbnailUrl: null })).rejects.toThrow(/quarantined/u)
      const missing = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
      await expect(as(uploaderId).update({ id, organizationId: orgId, thumbnailUrl: missing })).rejects.toThrow(/not found/u)
      const foreign = buildStorageKey({ tenantId: randomUUID(), entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
      await expect(as(uploaderId).update({ id, organizationId: orgId, thumbnailUrl: foreign })).rejects.toThrow(/another organization/u)
    } finally {
      if (saved === undefined) Reflect.deleteProperty(process.env, 'CLAMD_HOST')
      else process.env.CLAMD_HOST = saved
    }
  })

  it('create() enqueues a scan when a scanner is configured, and skips without one; uploader is the session user', async () => {
    const key = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    await getStorage().putObject({ key, body: Buffer.from('png'), contentType: 'image/png' })
    const saved = process.env.CLAMD_HOST
    process.env.CLAMD_HOST = '127.0.0.1:3310'
    try {
      const p = await as(uploaderId).create({ organizationId: orgId, propertyId, url: key, uploadedByUserId: adminId })
      expect(p.scanStatus).toBe('pending')
      const [row] = await getDb().select().from(propertyPhotos).where(eq(propertyPhotos.id, p.id))
      expect(row!.uploadedByUserId).toBe(uploaderId)
      const queued = await getDb().select().from(jobs).where(eq(jobs.organizationId, orgId))
      expect(queued.some((j) => j.kind === 'asset_scan' && (j.payload as { id?: string }).id === p.id)).toBe(true)
    } finally {
      if (saved === undefined) Reflect.deleteProperty(process.env, 'CLAMD_HOST')
      else process.env.CLAMD_HOST = saved
    }
    const key2 = buildStorageKey({ tenantId: orgId, entity: 'property_photo', entityId: propertyId, contentType: 'image/png' })
    await getStorage().putObject({ key: key2, body: Buffer.from('png'), contentType: 'image/png' })
    const q = await as(uploaderId).create({ organizationId: orgId, propertyId, url: key2 })
    expect(q.scanStatus).toBe('skipped')
    const queued = await getDb().select().from(jobs).where(eq(jobs.organizationId, orgId))
    expect(queued.some((j) => (j.payload as { id?: string }).id === q.id)).toBe(false)
  })

  it("the property's primary photo is never a photo the viewer may not see", async () => {
    await getDb().update(propertyPhotos).set({ deletedAt: new Date() }).where(eq(propertyPhotos.organizationId, orgId))
    const { key } = await pendingPhoto()
    const svc = (userId: string) => new RealPropertyService(() => ({ organizationId: orgId, userId }))
    expect((await svc(uploaderId).getWithDepth(propertyId, orgId))!.primaryPhotoUrl).toContain(key.split('/').pop()!.split('.')[0]!)
    expect((await svc(adminId).getWithDepth(propertyId, orgId))!.primaryPhotoUrl).toBeNull()
  })

  it('a scanner failure leaves the photo pending (the job retries)', async () => {
    const { id } = await pendingPhoto()
    const broken: ScanDriver = { name: 'clamav', scan: async () => { throw new Error('clamd: timeout') } }
    await expect(processAssetScan({ organizationId: orgId, entity: 'property_photo', id }, broken)).rejects.toThrow('clamd: timeout')
    const [row] = await getDb().select().from(propertyPhotos).where(eq(propertyPhotos.id, id))
    expect(row!.scanStatus).toBe('pending')
  })
})
