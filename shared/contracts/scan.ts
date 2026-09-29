/**
 * shared/contracts/scan.ts — asynchronous malware scanning of uploads
 * (WP-X3, ED-00E).
 *
 * # Decisions (ED-00E)
 *   - **Async, permissive for the uploader.** A new photo/attachment is
 *     `pending` until the worker scans it; the uploader can use it immediately,
 *     everyone else sees it as unavailable ("scanning") until `clean`. Blocking
 *     the upload on a scan would break the field offline queue.
 *   - **Infected → quarantine.** The object moves out of the servable key space
 *     (`quarantine/<key>`), the row stays with `infected`, nobody gets a URL,
 *     and org admins get an error-severity notification.
 *   - **No scanner configured → `skipped`** (also every row that predates
 *     scanning). `skipped` assets are served as before; `status()` tells admins
 *     scanning is off.
 *   - A scanner error keeps the asset `pending` and the job retries; it is
 *     never treated as clean.
 *   - WP-X3 review: the scan state only moves out of `pending` (every mark is
 *     conditional), so a racing rescan can never overwrite `infected`. An
 *     object that cannot be read is `failed` (withheld like `pending`), never
 *     `skipped`. The photo thumbnail is scanned and quarantined with the photo.
 *     `rescan` refuses infected (quarantined) and deleted assets.
 *   - A pending asset can be explicitly requeued after enqueue failure or
 *     exhausted retries. Duplicate jobs are safe; pending is not proof that
 *     a live job exists. Thumbnail replacements reset scanning and verdicts
 *     apply only to the immutable keys actually scanned.
 *   - The infected verdict is durable before quarantine starts. An infected
 *     row with no scannedAt timestamp retries cleanup and notification;
 *     partially moved objects never become servable again.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const ScanStatusSchema = z.enum(['pending', 'clean', 'infected', 'skipped', 'failed'])
export type ScanStatus = z.infer<typeof ScanStatusSchema>

export const ScannedEntitySchema = z.enum(['property_photo', 'property_attachment'])
export type ScannedEntity = z.infer<typeof ScannedEntitySchema>

export const ScanServiceStatusSchema = z.object({
  provider: z.enum(['clamav', 'none']),
  enabled: z.boolean(),
})
export type ScanServiceStatus = z.infer<typeof ScanServiceStatusSchema>

export const ScanRescanInputSchema = z.object({
  organizationId: UuidSchema,
  entity: ScannedEntitySchema,
  id: UuidSchema,
})
export type ScanRescanInput = z.infer<typeof ScanRescanInputSchema>

export interface IScanService {
  status(organizationId: string): Promise<ScanServiceStatus>
  /** Admin: queue a fresh scan of one asset (e.g. after enabling a scanner). */
  rescan(input: ScanRescanInput): Promise<{ status: ScanStatus }>
}
