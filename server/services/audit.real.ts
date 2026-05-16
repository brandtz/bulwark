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
import { desc, eq, and, inArray, or, sql, gte, lte, ilike } from 'drizzle-orm'
import type {
  AuditFilterInput,
  AuditFilterOutput,
  AuditListInput,
  AuditLogRow,
  AuditRecordInput,
  IAuditService,
  TimelineForPropertyInput,
} from '../../shared/contracts/audit'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { auditLog } from '../db/schema'
import { quotes } from '../db/schema/quotes'
import { workOrders } from '../db/schema/work_orders'
import { invoices } from '../db/schema/invoices'
import { assessments } from '../db/schema/assessments'
import { complianceDocs } from '../db/schema/compliance_docs'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
// W3-5 / EH-Q (ADR-0034): structured logger fallback for
// `logSystemError()` when the audit insert itself fails.
import { log } from '../utils/logger'

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
  constructor(
    private readonly db: DbOrTx = getDb(),
    private readonly tenantResolver?: TenantResolver,
  ) {}

  /** Bind this service to a specific transaction handle. */
  withTx(tx: DbOrTx): RealAuditService {
    return new RealAuditService(tx, this.tenantResolver)
  }

  async record(input: AuditRecordInput): Promise<AuditLogRow> {
    // Internal call site (via `withAudit`) — no firewall check; the
    // wrapping mutation already enforced tenancy. Public callers go
    // through `list` / `timelineForProperty` which DO assert.
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
    assertSameTenant(this.tenantResolver, input.organizationId)
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

  /**
   * Property-scoped activity feed (EH-D / W1-4). Gathers child entity
   * ids first (quotes, WOs, invoices, assessments, compliance docs)
   * then runs a single audit_log query filtered by
   * (entityType='property' AND entityId=propertyId) OR
   * (entityId IN <gathered ids>). Newest first.
   *
   * Performance note: at v1 scale (≤100 child entities per property)
   * the IN list stays tiny. If/when a single property has thousands
   * of child rows, swap the IN for a join + window.
   */
  async timelineForProperty(input: TimelineForPropertyInput): Promise<AuditLogRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const orgFilter = eq(auditLog.organizationId, input.organizationId)
    const [qIds, woIds, invIds, asmIds, cdIds] = await Promise.all([
      this.db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.organizationId, input.organizationId), eq(quotes.propertyId, input.propertyId))),
      this.db.select({ id: workOrders.id }).from(workOrders).where(and(eq(workOrders.organizationId, input.organizationId), eq(workOrders.propertyId, input.propertyId))),
      this.db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.organizationId, input.organizationId), eq(invoices.propertyId, input.propertyId))),
      this.db.select({ id: assessments.id }).from(assessments).where(and(eq(assessments.organizationId, input.organizationId), eq(assessments.propertyId, input.propertyId))),
      this.db.select({ id: complianceDocs.id }).from(complianceDocs).where(and(eq(complianceDocs.organizationId, input.organizationId), eq(complianceDocs.propertyId, input.propertyId))),
    ])
    const childIds = [...qIds, ...woIds, ...invIds, ...asmIds, ...cdIds].map((r) => r.id)

    const childClause = childIds.length > 0 ? inArray(auditLog.entityId, childIds) : sql`false`
    const propertyClause = and(eq(auditLog.entityType, 'property'), eq(auditLog.entityId, input.propertyId))

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(orgFilter, or(propertyClause, childClause)!))
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
    return rows.map(rowToContract)
  }

  async filter(input: AuditFilterInput): Promise<AuditFilterOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const conditions = [eq(auditLog.organizationId, input.organizationId)]
    if (input.dateFrom) conditions.push(gte(auditLog.createdAt, new Date(input.dateFrom)))
    if (input.dateTo) conditions.push(lte(auditLog.createdAt, new Date(input.dateTo)))
    if (input.actorUserId) conditions.push(eq(auditLog.actorUserId, input.actorUserId))
    if (input.entityType) conditions.push(eq(auditLog.entityType, input.entityType))
    if (input.action) conditions.push(eq(auditLog.action, input.action))
    if (input.entityId) conditions.push(eq(auditLog.entityId, input.entityId))
    if (input.search) {
      // Cast jsonb cols to text and ilike. Cheap; fine at v1 row counts.
      // W5-3 / ADR-0037: escape LIKE wildcards in user input.
      const q = escapeLikeContains(input.search)
      conditions.push(
        sql`(${auditLog.entityType} ILIKE ${q} OR ${auditLog.metadata}::text ILIKE ${q} OR ${auditLog.before}::text ILIKE ${q} OR ${auditLog.after}::text ILIKE ${q})`,
      )
    }
    void ilike // silence unused-import lint

    const where = and(...conditions)
    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where)
    const total = countRows[0]?.count ?? 0

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)

    return {
      rows: rows.map(rowToContract),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  /**
   * W3-3 / EH-M (ADR-0029) — list field check-in/out events recorded
   * against a single work order. Returns newest first.
   *
   * The check-in endpoint writes audit rows with `entityType='work_order'`,
   * `action='state_change'`, and `metadata.kind` in
   * `{'field.check_in','field.check_out'}` — we filter on the metadata
   * discriminator so unrelated WO state-change rows (status bumps,
   * trade assignment) don't leak into the field timeline.
   *
   * The metadata clause uses a JSONB `->>` lookup which is cheap at v1
   * row counts; if check-in volume ever rivals row count we can add a
   * partial index on (entity_id, (metadata->>'kind')).
   */
  async getCheckInsForWorkOrder(
    workOrderId: string,
    organizationId: string,
    limit = 50,
  ): Promise<AuditLogRow[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          eq(auditLog.entityType, 'work_order'),
          eq(auditLog.entityId, workOrderId),
          sql`${auditLog.metadata} ->> 'kind' IN ('field.check_in', 'field.check_out')`,
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
    return rows.map(rowToContract)
  }

  async exportCsv(input: Omit<AuditFilterInput, 'page' | 'pageSize'>): Promise<string> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Reuse filter() with a wide page size. Cap at 10k rows to avoid runaway exports.
    const { rows } = await this.filter({ ...input, page: 1, pageSize: 10000 })
    const header = [
      'id',
      'createdAt',
      'entityType',
      'entityId',
      'action',
      'actorUserId',
      'metadata',
      'before',
      'after',
    ].join(',')
    const escape = (s: string): string => {
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt,
        r.entityType,
        r.entityId,
        r.action,
        r.actorUserId ?? '',
        escape(JSON.stringify(r.metadata)),
        escape(JSON.stringify(r.before ?? null)),
        escape(JSON.stringify(r.after ?? null)),
      ].join(','),
    )
    return [header, ...lines].join('\n')
  }

  /**
   * W3-5 / EH-Q (ADR-0034): write an operational error to the
   * audit log without throwing. We avoid `assertSameTenant` here
   * because operational events occasionally arrive without an
   * organization scope (e.g. queue setup). Any DB failure is
   * swallowed and logged via the structured logger so that
   * failures-to-log-a-failure never crash the caller.
   */
  async logSystemError(input: {
    organizationId?: string
    kind: string
    message: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      await this.db.insert(auditLog).values({
        organizationId: input.organizationId ?? '00000000-0000-0000-0000-000000000000',
        entityType: 'system',
        entityId: '00000000-0000-0000-0000-000000000000',
        action: 'state_change',
        actorUserId: null,
        metadata: { kind: input.kind, message: input.message, ...(input.metadata ?? {}) },
        before: null,
        after: null,
      })
    } catch (err) {
      log('error', 'audit.logSystemError.failed', {
        kind: input.kind,
        message: input.message,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }
}
