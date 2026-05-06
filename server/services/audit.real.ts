/**
 * server/services/audit.real.ts — RealAuditService (E11-S2).
 *
 * # Decisions (ADR-0002, ADR-0008)
 *   - Append-only. `record()` is the only write. `list()` exists for
 *     the existing E9-S8 viewer (which today derives a feed from row
 *     timestamps; it'll switch to this once the surrounding services
 *     migrate).
 *   - Tx-aware. Both methods accept an optional Drizzle transaction so
 *     the typical "domain write + audit row in same atomic unit"
 *     composes through `withAudit()` in `_tx.ts`.
 *   - Returns the inserted row so callers can trace ids in tests
 *     without a follow-up SELECT.
 *
 * # Decision cast down
 *   - Rejected: a stream API for audit reads. v1 reads are bounded
 *     (max 500 rows). Pagination ladders in when a real customer
 *     pushes that ceiling.
 */
import { desc, eq, and } from 'drizzle-orm'
import type {
  AuditListInput,
  AuditLogRow,
  AuditRecordInput,
  IAuditService,
} from '../../shared/contracts/audit'
import { auditLog } from '../db/schema'
import { getDb } from '../db/client'

type DbOrTx = ReturnType<typeof getDb>

function rowToContract(row: typeof auditLog.$inferSelect): AuditLogRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action as AuditLogRow['action'],
    actorUserId: row.actorUserId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}

export class RealAuditService implements IAuditService {
  constructor(private readonly db: DbOrTx = getDb()) {}

  /** Bind this service to a specific transaction handle. */
  withTx(tx: DbOrTx): RealAuditService {
    return new RealAuditService(tx)
  }

  async record(input: AuditRecordInput): Promise<AuditLogRow> {
    const [row] = await this.db
      .insert(auditLog)
      .values({
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        metadata: input.metadata ?? {},
        before: input.before ?? null,
        after: input.after ?? null,
      })
      .returning()
    return rowToContract(row!)
  }

  async list(input: AuditListInput): Promise<AuditLogRow[]> {
    const conditions = [eq(auditLog.organizationId, input.organizationId)]
    if (input.entityType) conditions.push(eq(auditLog.entityType, input.entityType))
    if (input.entityId) conditions.push(eq(auditLog.entityId, input.entityId))

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
    return rows.map(rowToContract)
  }
}
