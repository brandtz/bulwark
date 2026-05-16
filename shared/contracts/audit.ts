/**
 * shared/contracts/audit.ts — append-only audit trail (E11-S2).
 *
 * # Decisions (ADR-0002, ADR-0008)
 *   - Audit is WRITE-FIRST. Every mutation in a real service composes
 *     into `withAudit(...)` which writes one audit_log row in the same
 *     transaction. The contract here exposes only `record()` (and a
 *     thin `list()` for the existing E9-S8 viewer) so call sites can't
 *     accidentally mutate or delete history.
 *   - `entityType` is free-text rather than a Zod enum. Adding a new
 *     domain entity should not require a contract revision; the audit
 *     row simply records what the writer told it. Authors are
 *     encouraged to use stable strings ('property', 'quote',
 *     'work_order', etc.).
 *   - `before` / `after` are bag-of-fields blobs, not the typed
 *     entity. Auditing the *change*, not the *entity*, means we can
 *     log partial diffs without dragging the full row schema along.
 *
 * # Decision cast down
 *   - Rejected: an `update()` or `delete()` on the audit service.
 *     Append-only is the rule. A misbehaving caller cannot rewrite
 *     history through the public surface.
 *   - Rejected: schema-typed `before`/`after`. Would mean every
 *     consumer maps its row into the audit shape; the resulting
 *     ceremony would discourage auditing edge-case mutations.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const AuditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'state_change',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditLogRowSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    entityType: z.string().min(1).max(60),
    entityId: UuidSchema,
    action: AuditActionSchema,
    actorUserId: UuidSchema.nullable(),
    metadata: z.record(z.unknown()).default({}),
    before: z.record(z.unknown()).nullable(),
    after: z.record(z.unknown()).nullable(),
  })
  .merge(AuditFieldsSchema)
export type AuditLogRow = z.infer<typeof AuditLogRowSchema>

export const AuditRecordInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: z.string().min(1).max(60),
  entityId: UuidSchema,
  action: AuditActionSchema,
  actorUserId: UuidSchema.nullable(),
  metadata: z.record(z.unknown()).optional(),
  before: z.record(z.unknown()).nullable().optional(),
  after: z.record(z.unknown()).nullable().optional(),
})
export type AuditRecordInput = z.infer<typeof AuditRecordInputSchema>

export const AuditListInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: z.string().optional(),
  entityId: UuidSchema.optional(),
  /** Newest first. Defaults to 100. */
  limit: z.number().int().positive().max(500).default(100),
})
export type AuditListInput = z.infer<typeof AuditListInputSchema>

export const TimelineForPropertyInputSchema = z.object({
  organizationId: UuidSchema,
  propertyId: UuidSchema,
  limit: z.number().int().positive().max(500).default(200),
})
export type TimelineForPropertyInput = z.infer<typeof TimelineForPropertyInputSchema>

// ----------------------------------------------------------------------------
// W2-4 / EH-H Part B — filterable list + CSV export for the audit-log page.
// ----------------------------------------------------------------------------
export const AuditFilterInputSchema = z.object({
  organizationId: UuidSchema,
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  actorUserId: UuidSchema.optional(),
  entityType: z.string().min(1).max(60).optional(),
  action: AuditActionSchema.optional(),
  entityId: UuidSchema.optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(200).default(50),
})
export type AuditFilterInput = z.infer<typeof AuditFilterInputSchema>

export const AuditFilterOutputSchema = z.object({
  rows: z.array(AuditLogRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})
export type AuditFilterOutput = z.infer<typeof AuditFilterOutputSchema>

export interface IAuditService {
  record(input: AuditRecordInput): Promise<AuditLogRow>
  list(input: AuditListInput): Promise<AuditLogRow[]>
  /**
   * Property-scoped activity feed. Returns audit rows for the property
   * itself AND for every child entity that hangs off the property
   * (quotes, work orders, invoices, assessments, compliance docs).
   * Newest first. Used by EH-D property detail Activity tab.
   */
  timelineForProperty(input: TimelineForPropertyInput): Promise<AuditLogRow[]>
  /** W2-4: paginated filterable list for the audit-log settings page. */
  filter(input: AuditFilterInput): Promise<AuditFilterOutput>
  /** W2-4: CSV string of the same filtered rows (no pagination). */
  exportCsv(input: Omit<AuditFilterInput, 'page' | 'pageSize'>): Promise<string>
  /**
   * W3-5 / EH-Q (ADR-0034): record an operational error that is
   * useful to surface in the audit timeline (jobs failed, webhook
   * dispatch failed, etc.). Stored as a single `audit_log` row with
   * `entityType='system'` and `action='state_change'`; the kind +
   * message land in `metadata` so the filter UI can pivot on
   * `metadata.kind`. Implementations MUST NOT throw; logging an
   * error must never break the caller.
   */
  logSystemError(input: {
    organizationId?: string
    kind: string
    message: string
    metadata?: Record<string, unknown>
  }): Promise<void>
}
