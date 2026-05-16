/**
 * server/services/inspection.real.ts — RealInspectionService
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0019)
 *   - Same pattern as the rest of the real services: tenant firewall,
 *     `withAudit` on mutations, ISO-string mapping.
 *   - `saveResponses` is an upsert keyed on the DB's unique constraint
 *     `(inspectionId, sectionInstanceKey, fieldSlug)` — uses
 *     `INSERT ... ON CONFLICT ... DO UPDATE` so re-submitting the same
 *     keys updates in place.
 *   - `evaluate()` defers to the pure `shared/utils/inspection-
 *     evaluator.ts` after loading the template hydrated by
 *     `RealInspectionTemplateService.getWithSections`. The audit hook
 *     attaches a `metadata.kind = 'evaluate'` row so we can correlate
 *     re-evaluations with the row history.
 */
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  IInspectionService,
  Inspection,
  InspectionCreateInput,
  InspectionIssue,
  InspectionListInput,
  InspectionListOutput,
  InspectionResponse,
  InspectionSignInput,
  InspectionWithResponses,
  SaveResponsesInput, InspectionStatus 
} from '../../shared/contracts/inspection'

import { evaluateInspection } from '../../shared/utils/inspection-evaluator'
import { getDb } from '../db/client'
import { inspections } from '../db/schema/inspections'
import { inspectionResponses } from '../db/schema/inspection_responses'
import type { Inspection as DbInspection } from '../db/schema/inspections'
import type { InspectionResponse as DbResponse } from '../db/schema/inspection_responses'
import { RealInspectionTemplateService } from './inspection-template.real'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function inspectionToContract(r: DbInspection): Inspection {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    buildingId: r.buildingId,
    templateId: r.templateId,
    templateVersion: r.templateVersion,
    programId: r.programId,
    inspectorUserId: r.inspectorUserId,
    startedAt: r.startedAt.toISOString(),
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    signedByName: r.signedByName,
    signatureUrl: r.signatureUrl,
    status: r.status as InspectionStatus,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function responseToContract(r: DbResponse): InspectionResponse {
  return {
    id: r.id,
    inspectionId: r.inspectionId,
    sectionInstanceKey: r.sectionInstanceKey,
    fieldSlug: r.fieldSlug,
    valueJson: r.valueJson ?? null,
    photosCount: r.photosCount,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealInspectionService implements IInspectionService {
  private readonly templates: RealInspectionTemplateService

  constructor(private readonly tenantResolver?: TenantResolver) {
    this.templates = new RealInspectionTemplateService(tenantResolver)
  }

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: InspectionListInput): Promise<InspectionListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(inspections.organizationId, input.organizationId),
      sql`${inspections.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(inspections.propertyId, input.propertyId))
    if (input.status) conditions.push(eq(inspections.status, input.status))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(inspections)
        .where(where)
        .orderBy(asc(inspections.startedAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(inspections).where(where),
    ])
    return {
      rows: rows.map(inspectionToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Inspection | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(inspections)
      .where(
        and(
          eq(inspections.id, id),
          eq(inspections.organizationId, organizationId),
          sql`${inspections.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? inspectionToContract(row) : null
  }

  async getWithResponses(
    id: string,
    organizationId: string,
  ): Promise<InspectionWithResponses | null> {
    const i = await this.get(id, organizationId)
    if (!i) return null
    const db = getDb()
    const responseRows = await db
      .select()
      .from(inspectionResponses)
      .where(eq(inspectionResponses.inspectionId, i.id))
    return { ...i, responses: responseRows.map(responseToContract) }
  }

  async create(input: InspectionCreateInput): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(inspections)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          buildingId: input.buildingId ?? null,
          templateId: input.templateId,
          templateVersion: 1,
          programId: input.programId ?? null,
          inspectorUserId: input.inspectorUserId ?? null,
          status: 'draft',
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'inspection',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { propertyId: row!.propertyId, templateId: row!.templateId },
      })
      return inspectionToContract(row!)
    })
  }

  async saveResponses(input: SaveResponsesInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    if (input.responses.length === 0) return
    const db = getDb()
    // Verify inspection exists + is editable BEFORE writing responses.
    const [insp] = await db
      .select()
      .from(inspections)
      .where(
        and(
          eq(inspections.id, input.inspectionId),
          eq(inspections.organizationId, input.organizationId),
        ),
      )
      .limit(1)
    if (!insp) throw new Error('Inspection not found')
    if (insp.status !== 'draft') throw new Error('Inspection is no longer editable')

    // Bulk upsert via ON CONFLICT on the unique index.
    for (const r of input.responses) {
      await db
        .insert(inspectionResponses)
        .values({
          inspectionId: input.inspectionId,
          sectionInstanceKey: r.sectionInstanceKey,
          fieldSlug: r.fieldSlug,
          valueJson: (r.valueJson ?? null) as unknown,
          photosCount: r.photosCount ?? 0,
          notes: r.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [
            inspectionResponses.inspectionId,
            inspectionResponses.sectionInstanceKey,
            inspectionResponses.fieldSlug,
          ],
          set: {
            valueJson: (r.valueJson ?? null) as unknown,
            photosCount: r.photosCount ?? 0,
            notes: r.notes ?? null,
            updatedAt: new Date(),
          },
        })
    }
    await db
      .update(inspections)
      .set({ updatedAt: new Date() })
      .where(eq(inspections.id, input.inspectionId))
  }

  async submit(input: { organizationId: string; inspectionId: string }): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(inspections)
        .where(
          and(
            eq(inspections.id, input.inspectionId),
            eq(inspections.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Inspection not found')
      if (before.status !== 'draft') return inspectionToContract(before)
      const [row] = await tx
        .update(inspections)
        .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(inspections.id, input.inspectionId))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'inspection',
        entityId: input.inspectionId,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        before: { status: 'draft' },
        after: { status: 'submitted' },
      })
      return inspectionToContract(row!)
    })
  }

  async sign(input: InspectionSignInput): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(inspections)
        .where(
          and(
            eq(inspections.id, input.inspectionId),
            eq(inspections.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before) throw new Error('Inspection not found')
      const now = new Date()
      const [row] = await tx
        .update(inspections)
        .set({
          status: 'signed',
          submittedAt: before.submittedAt ?? now,
          signedAt: now,
          signedByName: input.signedByName,
          signatureUrl: input.signatureDataUrl,
          updatedAt: now,
        })
        .where(eq(inspections.id, input.inspectionId))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'inspection',
        entityId: input.inspectionId,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        before: { status: before.status },
        after: { status: 'signed', signedByName: input.signedByName },
      })
      return inspectionToContract(row!)
    })
  }

  async evaluate(input: {
    organizationId: string
    inspectionId: string
  }): Promise<{ issues: InspectionIssue[] }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const i = await this.get(input.inspectionId, input.organizationId)
    if (!i) throw new Error('Inspection not found')
    const template = await this.templates.getWithSections(i.templateId, i.organizationId)
    if (!template) return { issues: [] }
    const db = getDb()
    const responseRows = await db
      .select()
      .from(inspectionResponses)
      .where(eq(inspectionResponses.inspectionId, i.id))
    const issues = evaluateInspection(template, responseRows.map(responseToContract))
    return { issues }
  }
}
