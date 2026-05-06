/**
 * server/services/job.real.ts — RealJobService (E11-S9).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Two-step submission: (1) write a row to OUR `jobs` table so the
 *     read API is independent of pg-boss internals; (2) publish to the
 *     pg-boss queue with the just-minted job id as the payload key the
 *     worker uses to find the row again.
 *   - Status transitions are written by the WORKER (server/jobs/worker.ts)
 *     to our `jobs` table, not by pg-boss. pg-boss owns retry + backoff;
 *     we own the user-visible status surface.
 *   - `get()` reads only OUR table. Tenant-firewalled like every other
 *     Real* service.
 *   - The contract is `create + get` (no `list` — that's a worker
 *     concern). Audit-log on create only; status changes are recorded
 *     by the worker via `auditFromWorker()` helper if we add one in S10.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { IJobService, Job, JobCreateInput } from '../../shared/contracts/job'
import { getDb } from '../db/client'
import { jobs } from '../db/schema/jobs'
import type { Job as DbJob } from '../db/schema/jobs'
import { getBoss, QUEUE_COMPLIANCE_DOC } from '../jobs/boss'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbJob): Job {
  return {
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind,
    status: r.status,
    payload: r.payload,
    resultUrl: r.resultUrl,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function queueNameForKind(kind: Job['kind']): string {
  switch (kind) {
    case 'compliance_doc':
      return QUEUE_COMPLIANCE_DOC
    default: {
      // Exhaustive check — every JobKind must map to a queue.
      const _exhaustive: never = kind
      throw new Error(`No queue mapped for job kind: ${_exhaustive}`)
    }
  }
}

export class RealJobService implements IJobService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async create(input: JobCreateInput): Promise<Job> {
    assertSameTenant(this.tenantResolver, input.organizationId)

    // 1. Insert OUR row first so the worker (or get()) always finds a
    //    persistent record even if pg-boss is briefly unreachable.
    const row = await withAudit(async ({ tx, audit }) => {
      const [r] = await tx
        .insert(jobs)
        .values({
          organizationId: input.organizationId,
          kind: input.kind,
          status: 'queued',
          payload: input.payload ?? {},
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'job',
        entityId: r!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { kind: input.kind },
      })
      return r!
    })

    // 2. Publish to pg-boss. Worker pulls this and writes terminal
    //    status back to our row.
    const boss = await getBoss()
    await boss.send(queueNameForKind(input.kind), {
      jobId: row.id,
      organizationId: row.organizationId,
      kind: row.kind,
      payload: row.payload,
    })

    return rowToContract(row)
  }

  async get(id: string, organizationId: string): Promise<Job | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.organizationId, organizationId), sql`${jobs.deletedAt} IS NULL`))
      .limit(1)
    return row ? rowToContract(row) : null
  }
}
