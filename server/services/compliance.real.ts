/**
 * server/services/compliance.real.ts — RealComplianceDocService (E11-S10).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Mirrors MockComplianceDocService: list/get/create/syncFromJob.
 *   - `create()`: insert doc row in `generating`, then enqueue a
 *     `compliance_doc` job via RealJobService whose payload carries
 *     the docId. Worker handler reads the row, renders a PDF, uploads
 *     to R2, returns the signed URL.
 *   - `syncFromJob()`: reads the linked job and mirrors terminal state
 *     onto the doc row (job.succeeded → doc.ready, etc.). Idempotent.
 *   - Tenant firewall on every method.
 */
import { and, eq, sql } from 'drizzle-orm'
import type {
  ComplianceDoc,
  ComplianceDocCreateInput,
  ComplianceDocListInput,
  ComplianceDocStatus,
  IComplianceDocService,
} from '../../shared/contracts/compliance'
import { isTerminalComplianceDocStatus } from '../../shared/contracts/compliance'
import { getDb } from '../db/client'
import { complianceDocs } from '../db/schema/compliance_docs'
import type { ComplianceDoc as DbComplianceDoc } from '../db/schema/compliance_docs'
import { RealJobService } from './job.real'
import { RealInspectionService } from './inspection.real'
import { inspections } from '../db/schema/inspections'
import { assertSameTenant, resolveActorUserId, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import { complianceDocReady } from '../../shared/events/catalog'

function rowToContract(r: DbComplianceDoc): ComplianceDoc {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    workOrderIds: r.workOrderIds,
    includedSlotIds: r.includedSlotIds,
    signature: r.signature,
    jobId: r.jobId,
    status: r.status,
    resultUrl: r.resultUrl,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealComplianceDocService implements IComplianceDocService {
  private readonly jobs: RealJobService
  private readonly inspectionService: RealInspectionService

  constructor(private readonly tenantResolver?: TenantResolver) {
    this.jobs = new RealJobService(tenantResolver)
    this.inspectionService = new RealInspectionService(tenantResolver)
  }

  async list(input: ComplianceDocListInput): Promise<ComplianceDoc[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions = [
      eq(complianceDocs.organizationId, input.organizationId),
      sql`${complianceDocs.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(complianceDocs.propertyId, input.propertyId))
    const rows = await db
      .select()
      .from(complianceDocs)
      .where(and(...conditions))
    return rows
      .map(rowToContract)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async get(id: string, organizationId: string): Promise<ComplianceDoc | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(complianceDocs)
      .where(
        and(
          eq(complianceDocs.id, id),
          eq(complianceDocs.organizationId, organizationId),
          sql`${complianceDocs.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: ComplianceDocCreateInput): Promise<ComplianceDoc> {
    assertSameTenant(this.tenantResolver, input.organizationId)

    const now = new Date().toISOString()

    // 1. Insert doc row in `generating`. We need its id before enqueuing
    //    the job so the handler can hydrate the row by id.
    const docRow = await withAudit(async ({ tx, audit }) => {
      const [r] = await tx
        .insert(complianceDocs)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          workOrderIds: input.workOrderIds,
          includedSlotIds: input.includedSlotIds,
          signature: { ...input.signature, signedAt: now },
          status: 'generating',
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'compliance_doc',
        entityId: r!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { propertyId: input.propertyId, workOrderIds: input.workOrderIds },
      })
      return r!
    })

    // 2. Enqueue the job with the docId in the payload.
    //    L04-S4: an enqueue failure must not orphan the doc in `generating`
    //    forever — mark it `failed` (operator-recoverable via reenqueue())
    //    and rethrow so the caller sees the real error.
    let job: Awaited<ReturnType<RealJobService['create']>>
    try {
      job = await this.jobs.create({
        organizationId: input.organizationId,
        kind: 'compliance_doc',
        payload: {
          docId: docRow.id,
          propertyId: input.propertyId,
          workOrderIds: input.workOrderIds,
          includedSlotIds: input.includedSlotIds,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await withAudit(async ({ tx, audit }) => {
        await tx
          .update(complianceDocs)
          .set({
            status: 'failed',
            error: `Job enqueue failed: ${message}`.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(complianceDocs.id, docRow.id))
        await audit.record({
          organizationId: input.organizationId,
          entityType: 'compliance_doc',
          entityId: docRow.id,
          action: 'state_change',
          actorUserId: resolveActorUserId(this.tenantResolver),
          metadata: { kind: 'enqueue_failed', error: message.slice(0, 500) },
        })
      })
      throw err
    }

    // 3. Stamp the job id on the doc row.
    const db = getDb()
    const [updated] = await db
      .update(complianceDocs)
      .set({ jobId: job.id, updatedAt: new Date() })
      .where(eq(complianceDocs.id, docRow.id))
      .returning()

    // 4. W2-2 (ADR-0019): if the property has an active inspection tied
    //    to a program, prefer the inspection-template evaluator over the
    //    hardcoded wildfire path so non-default-template orgs get their
    //    custom rules respected. We record an audit row noting the
    //    evaluator was invoked; the resulting issues land in the doc
    //    rendering pipeline as a follow-up — for now the audit trail is
    //    the proof of wiring. Falls back silently when no inspection
    //    exists for the property.
    const [activeInspection] = await db
      .select()
      .from(inspections)
      .where(
        and(
          eq(inspections.organizationId, input.organizationId),
          eq(inspections.propertyId, input.propertyId),
          sql`${inspections.deletedAt} IS NULL`,
        ),
      )
      .orderBy(sql`${inspections.startedAt} DESC`)
      .limit(1)
    if (activeInspection?.programId) {
      try {
        await this.inspectionService.evaluate({
          organizationId: input.organizationId,
          inspectionId: activeInspection.id,
        })
        await withAudit(async ({ audit }) => {
          await audit.record({
            organizationId: input.organizationId,
            entityType: 'compliance_doc',
            entityId: updated!.id,
            action: 'update',
            actorUserId: this.tenantResolver?.()?.userId ?? null,
            metadata: { kind: 'inspection_evaluator_used', inspectionId: activeInspection.id },
          })
        })
      } catch {
        // Best-effort hook; never block doc generation on evaluator failure.
      }
    }

    return rowToContract(updated!)
  }

  async syncFromJob(id: string, organizationId: string): Promise<ComplianceDoc> {
    assertSameTenant(this.tenantResolver, organizationId)
    const current = await this.get(id, organizationId)
    if (!current) throw new Error(`ComplianceDoc not found: ${id}`)
    if (isTerminalComplianceDocStatus(current.status)) return current
    if (!current.jobId) return current

    const job = await this.jobs.get(current.jobId, organizationId)
    if (!job) return current

    let nextStatus: ComplianceDocStatus = current.status
    if (job.status === 'succeeded') nextStatus = 'ready'
    else if (job.status === 'failed') nextStatus = 'failed'
    else if (job.status === 'running') nextStatus = 'generating'

    if (
      nextStatus === current.status &&
      current.resultUrl === job.resultUrl &&
      current.error === job.error
    ) {
      return current
    }

    const db = getDb()
    const [row] = await db
      .update(complianceDocs)
      .set({
        status: nextStatus,
        resultUrl: job.resultUrl,
        error: job.error,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(complianceDocs.id, id),
          eq(complianceDocs.organizationId, organizationId),
        ),
      )
      .returning()
    const updated = rowToContract(row!)
    // Post-transaction emit (ADR-0017): only when we just flipped into
    // `ready`. Re-syncs of an already-ready doc are no-ops above so
    // they never reach this branch.
    if (nextStatus === 'ready' && current.status !== 'ready') {
      await emit(complianceDocReady, {
        organizationId,
        entityId: updated.id,
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        timestamp: new Date().toISOString(),
        propertyId: updated.propertyId,
      })
    }
    return updated
  }

  async reconcileGenerating(input: {
    organizationId: string
    olderThanMinutes?: number
  }): Promise<{ reconciled: number; docIds: string[] }> {
    // L04-S4: docs stuck in `generating` past the threshold with no live job
    // (job missing, or job already terminal) are failed so an operator can
    // reenqueue(). Docs whose job actually succeeded are synced to `ready`
    // instead — reconciliation must never destroy a good result.
    assertSameTenant(this.tenantResolver, input.organizationId)
    const olderThanMin = input.olderThanMinutes ?? 30
    const cutoff = new Date(Date.now() - olderThanMin * 60_000)
    const db = getDb()

    const stuck = await db
      .select()
      .from(complianceDocs)
      .where(
        and(
          eq(complianceDocs.organizationId, input.organizationId),
          eq(complianceDocs.status, 'generating'),
          sql`${complianceDocs.updatedAt} < ${cutoff.toISOString()}`,
          sql`${complianceDocs.deletedAt} IS NULL`,
        ),
      )

    const failedIds: string[] = []
    for (const doc of stuck) {
      const job = doc.jobId ? await this.jobs.get(doc.jobId, input.organizationId) : null
      if (job && (job.status === 'queued' || job.status === 'running')) continue // live — leave it
      if (job && job.status === 'succeeded') {
        await this.syncFromJob(doc.id, input.organizationId)
        continue
      }
      const reason = job
        ? `Orphaned: job ${job.id} is ${job.status} but doc stayed generating`
        : 'Orphaned: no job attached after enqueue'
      await withAudit(async ({ tx, audit }) => {
        await tx
          .update(complianceDocs)
          .set({ status: 'failed', error: reason, updatedAt: new Date() })
          .where(eq(complianceDocs.id, doc.id))
        await audit.record({
          organizationId: input.organizationId,
          entityType: 'compliance_doc',
          entityId: doc.id,
          action: 'state_change',
          actorUserId: resolveActorUserId(this.tenantResolver),
          metadata: { kind: 'reconcile_orphaned_generating', reason, olderThanMin },
        })
      })
      failedIds.push(doc.id)
    }
    return { reconciled: failedIds.length, docIds: failedIds }
  }

  async reenqueue(id: string, organizationId: string): Promise<ComplianceDoc> {
    // L04-S4 operator recovery: a `failed` doc gets a FRESH job (new job id,
    // same payload) and flips back to `generating`. The handler keys the R2
    // object by docId, so a re-run overwrites safely (idempotent contract).
    assertSameTenant(this.tenantResolver, organizationId)
    const current = await this.get(id, organizationId)
    if (!current) throw new Error(`ComplianceDoc not found: ${id}`)
    if (current.status !== 'failed') {
      throw new Error(
        `Invalid state: only failed docs can be re-enqueued (doc is ${current.status})`,
      )
    }

    const job = await this.jobs.create({
      organizationId,
      kind: 'compliance_doc',
      payload: {
        docId: current.id,
        propertyId: current.propertyId,
        workOrderIds: current.workOrderIds,
        includedSlotIds: current.includedSlotIds,
      },
    })

    const db = getDb()
    const [row] = await db
      .update(complianceDocs)
      .set({ status: 'generating', jobId: job.id, error: null, updatedAt: new Date() })
      .where(
        and(eq(complianceDocs.id, id), eq(complianceDocs.organizationId, organizationId)),
      )
      .returning()
    await withAudit(async ({ audit }) => {
      await audit.record({
        organizationId,
        entityType: 'compliance_doc',
        entityId: id,
        action: 'state_change',
        actorUserId: resolveActorUserId(this.tenantResolver),
        metadata: { kind: 'reenqueued', newJobId: job.id },
      })
    })
    return rowToContract(row!)
  }
}
