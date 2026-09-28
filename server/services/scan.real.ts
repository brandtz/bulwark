/**
 * server/services/scan.real.ts — RealScanService (WP-X3, ED-00E).
 * Admin surface over async asset scanning; see shared/contracts/scan.ts.
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { propertyAttachments } from '../db/schema/property_attachments'
import { propertyPhotos } from '../db/schema/property_photos'
import {
  ScanRescanInputSchema,
  type IScanService,
  type ScanRescanInput,
  type ScanServiceStatus,
  type ScanStatus,
} from '../../shared/contracts/scan'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { resolveScanDriver, type ScanDriver } from './_providers/scan'
import { enqueueAssetScan } from './storage/asset-scan'

const TABLES = { property_photo: propertyPhotos, property_attachment: propertyAttachments } as const

export class RealScanService implements IScanService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly driver: () => ScanDriver = () => resolveScanDriver(),
  ) {}

  async status(organizationId: string): Promise<ScanServiceStatus> {
    assertSameTenant(this.tenantResolver, organizationId)
    const d = this.driver()
    return { provider: d.name, enabled: d.name !== 'none' }
  }

  async rescan(input: ScanRescanInput): Promise<{ status: ScanStatus }> {
    const parsed = ScanRescanInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid rescan input: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const { organizationId, entity, id } = parsed.data
    assertSameTenant(this.tenantResolver, organizationId)
    if (this.driver().name === 'none') throw new Error('Invalid rescan: no scanner is configured')
    const table = TABLES[entity]
    const [row] = await getDb()
      .update(table)
      .set({ scanStatus: 'pending', scannedAt: null })
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .returning({ id: table.id })
    if (!row) throw new Error('Asset not found')
    await enqueueAssetScan({ organizationId, entity, id })
    return { status: 'pending' }
  }
}
