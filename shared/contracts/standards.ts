/**
 * shared/contracts/standards.ts — per-tenant compliance standards (E9-S3).
 *
 * # Decisions (ADR-0008)
 *   - Compliance standards live as one-row-per-tenant (org-scoped).
 *     `get(orgId)` returns the saved row or, if the tenant has never
 *     customised, the `OREGON_DEFAULT_STANDARDS` fallback.
 *   - `save(orgId, patch)` is a full replace, not a merge — the
 *     editor always submits the complete shape, which keeps the
 *     contract simple and avoids field-by-field diffing.
 *
 * # Decision cast down
 *   - Rejected: a separate "reset to defaults" RPC. The editor can
 *     just resubmit `OREGON_DEFAULT_STANDARDS` and the row is
 *     overwritten — same wire shape, no extra surface.
 */
import { z } from 'zod'
import {
  ComplianceStandardsSchema,
  type ComplianceStandards,
} from './assessment'

export const StandardsRowSchema = z.object({
  organizationId: z.string(),
  standards: ComplianceStandardsSchema,
  updatedAt: z.string(),
  updatedById: z.string().nullable(),
})
export type StandardsRow = z.infer<typeof StandardsRowSchema>

export interface IStandardsService {
  get(orgId: string): Promise<StandardsRow>
  save(
    orgId: string,
    standards: ComplianceStandards,
    updatedById: string | null,
  ): Promise<StandardsRow>
}
