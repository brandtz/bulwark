/**
 * server/jobs/handlers/asset-scan.ts — `asset_scan` job (WP-X3, ED-00E).
 * Logic lives in server/services/storage/asset-scan.ts; a scanner error throws
 * so pg-boss retries (JOB_POLICIES.asset_scan) and the asset stays pending.
 */
import type { JobEnvelope, JobHandlerResult } from './index'
import { processAssetScan } from '../../services/storage/asset-scan'
import { ScannedEntitySchema } from '../../../shared/contracts/scan'

export async function assetScanHandler(env: JobEnvelope): Promise<JobHandlerResult> {
  const payload = env.payload as { entity?: unknown, id?: unknown }
  const entity = ScannedEntitySchema.parse(payload.entity)
  if (typeof payload.id !== 'string') throw new Error('asset_scan: payload.id missing')
  const outcome = await processAssetScan({ organizationId: env.organizationId, entity, id: payload.id })
  return { summary: { entity, id: payload.id, ...outcome } }
}
