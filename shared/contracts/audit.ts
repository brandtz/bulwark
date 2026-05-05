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

export interface IAuditService {
  record(input: AuditRecordInput): Promise<AuditLogRow>
  list(input: AuditListInput): Promise<AuditLogRow[]>
}
