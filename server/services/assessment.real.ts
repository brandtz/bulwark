/**
 * server/services/assessment.real.ts — RealAssessmentService (E11-S6).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit pattern as RealPropertyService. create()
 *     wraps in withAudit so the assessment row + audit_log row are
 *     atomic.
 *   - "Latest for property" = ORDER BY assessed_at DESC LIMIT 1. Indexed
 *     impl can wait until volumes warrant it.
 *   - Assessments are immutable once created (no update/delete in the
 *     IAssessmentService contract). Field crews "redo" by inserting a
 *     fresh row; the latest-for-property query reads the new one.
 */
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  Assessment,
  AssessmentCreateInput,
  AssessmentListInput,
  AssessmentListOutput,
  IAssessmentService,
} from '../../shared/contracts/assessment'
import { getDb } from '../db/client'
import { assessments } from '../db/schema/assessments'
import type { Assessment as DbAssessment } from '../db/schema/assessments'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import { assessmentSigned } from '../../shared/events/catalog'

function rowToContract(r: DbAssessment): Assessment {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    assessedById: r.assessedById,
    assessedAt: r.assessedAt.toISOString(),
    roofMaterial: r.roofMaterial,
    sidingMaterial: r.sidingMaterial,
    eaveType: r.eaveType,
    ventType: r.ventType,
    defensibleSpaceCleared: r.defensibleSpaceCleared,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealAssessmentService implements IAssessmentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: AssessmentListInput): Promise<AssessmentListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(assessments.organizationId, input.organizationId),
      sql`${assessments.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(assessments.propertyId, input.propertyId))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(assessments)
        .where(where)
        .orderBy(desc(assessments.assessedAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(assessments).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async getLatestForProperty(propertyId: string, organizationId: string): Promise<Assessment | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(assessments)
      .where(
        and(
          eq(assessments.propertyId, propertyId),
          eq(assessments.organizationId, organizationId),
          sql`${assessments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(assessments.assessedAt))
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: AssessmentCreateInput): Promise<Assessment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const created = await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(assessments)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          assessedById: input.assessedById,
          assessedAt: new Date(input.assessedAt),
          roofMaterial: input.roofMaterial,
          sidingMaterial: input.sidingMaterial,
          eaveType: input.eaveType,
          ventType: input.ventType,
          defensibleSpaceCleared: input.defensibleSpaceCleared,
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'assessment',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? input.assessedById,
        after: {
          propertyId: row!.propertyId,
          roofMaterial: row!.roofMaterial,
          sidingMaterial: row!.sidingMaterial,
          eaveType: row!.eaveType,
          ventType: row!.ventType,
          defensibleSpaceCleared: row!.defensibleSpaceCleared,
        },
      })
      return rowToContract(row!)
    })
    // Post-transaction emit (ADR-0017). E4 does not yet have a
    // separate "sign" mutation — capture-and-sign is one step in the
    // current Wildfire inspection form. W2-2's inspection template
    // engine may introduce a dedicated sign step; until then, the
    // assessment row itself is the signed artifact.
    await emit(assessmentSigned, {
      organizationId: created.organizationId,
      entityId: created.id,
      actorUserId: this.tenantResolver?.()?.userId ?? input.assessedById,
      timestamp: new Date().toISOString(),
      propertyId: created.propertyId,
    })
    return created
  }
}
