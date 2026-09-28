/**
 * server/services/storage/asset-scan.ts — async malware scan of uploaded assets
 * (WP-X3, ED-00E). Contract and decisions: shared/contracts/scan.ts.
 *
 * - `initialScanStatus()` — what a new photo/attachment row starts as.
 * - `enqueueAssetScan()` — called by the owning service after the row exists.
 * - `processAssetScan()` — the `asset_scan` job body: read the bytes, scan,
 *   mark clean, or quarantine + notify org admins. Idempotent (only `pending`
 *   rows are processed), so a pg-boss retry after a partial failure is safe.
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { memberships } from '../../db/schema/users'
import { propertyAttachments } from '../../db/schema/property_attachments'
import { propertyPhotos } from '../../db/schema/property_photos'
import type { ScanStatus, ScannedEntity } from '../../../shared/contracts/scan'
import { resolveScanDriver, type ScanDriver } from '../_providers/scan'
import { SYSTEM_USER_ID } from '../_tenant'
import { log } from '../../utils/logger'
import { getStorage } from './index'
import { isStorageKey } from './asset-urls'

const TABLES = {
  property_photo: propertyPhotos,
  property_attachment: propertyAttachments,
} as const

export function initialScanStatus(driver: ScanDriver = resolveScanDriver()): ScanStatus {
  return driver.name === 'none' ? 'skipped' : 'pending'
}

const systemResolver = (organizationId: string) => () => ({ organizationId, userId: SYSTEM_USER_ID })

export interface AssetRef {
  organizationId: string
  entity: ScannedEntity
  id: string
}

/** Queue a scan for a `pending` asset. Failures are logged, not thrown: the row stays pending and an admin can rescan. */
export async function enqueueAssetScan(ref: AssetRef): Promise<void> {
  try {
    const { RealJobService } = await import('../job.real')
    await new RealJobService(systemResolver(ref.organizationId)).create({
      organizationId: ref.organizationId,
      kind: 'asset_scan',
      payload: { entity: ref.entity, id: ref.id },
    })
  } catch (err) {
    log('error', 'asset_scan.enqueue_failed', { entity: ref.entity, id: ref.id, message: err instanceof Error ? err.message : 'unknown' })
  }
}

export interface ScanOutcome {
  status: ScanStatus
  signature?: string
  quarantinedAt?: string
}

export async function processAssetScan(ref: AssetRef, driver: ScanDriver = resolveScanDriver()): Promise<ScanOutcome> {
  const table = TABLES[ref.entity]
  const db = getDb()
  const where = and(eq(table.id, ref.id), eq(table.organizationId, ref.organizationId))
  const [row] = await db.select().from(table).where(where).limit(1)
  if (!row) return { status: 'skipped' } // deleted meanwhile
  if (row.scanStatus !== 'pending') return { status: row.scanStatus as ScanStatus }

  const mark = async (status: ScanStatus) => {
    await db.update(table).set({ scanStatus: status, scannedAt: new Date() }).where(where)
  }
  if (driver.name === 'none' || !isStorageKey(row.url)) {
    await mark('skipped')
    return { status: 'skipped' }
  }
  const storage = getStorage()
  const bytes = await storage.getObject(row.url)
  if (!bytes) {
    await mark('skipped')
    return { status: 'skipped' }
  }

  const verdict = await driver.scan(bytes) // throws on scanner errors → job retries, row stays pending
  if (verdict.clean) {
    await mark('clean')
    return { status: 'clean' }
  }

  const quarantinedAt = await storage.quarantineObject(row.url)
  await mark('infected')
  log('warn', 'asset_scan.infected', { entity: ref.entity, id: ref.id, signature: verdict.signature })
  await notifyAdmins(ref, verdict.signature ?? 'unknown')
  return { status: 'infected', signature: verdict.signature, quarantinedAt }
}

async function notifyAdmins(ref: AssetRef, signature: string): Promise<void> {
  const admins = await getDb()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, ref.organizationId), eq(memberships.role, 'org_admin'), eq(memberships.isActive, true)))
  const { RealNotificationService } = await import('../notification.real')
  const notifications = new RealNotificationService(systemResolver(ref.organizationId))
  for (const a of admins) {
    await notifications.enqueue({
      organizationId: ref.organizationId,
      userId: a.userId,
      eventType: 'asset.quarantined',
      title: 'An uploaded file was quarantined',
      body: `A ${ref.entity === 'property_photo' ? 'photo' : 'attachment'} failed the malware scan (${signature}) and was removed from use.`,
      severity: 'error',
      relatedEntityType: ref.entity,
      relatedEntityId: ref.id,
    })
  }
}
