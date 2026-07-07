/**
 * server/services/job.real.ts — RealJobService (E11-S9, extended L04/L05).
 *
 * # Decisions (ADR-0008, ADR-0012, ADR-0005)
 *   - Two-step submission: (1) write a row to OUR `jobs` table so the
 *     read API is independent of pg-boss internals; (2) publish to the
 *     pg-boss queue with the just-minted job id as the payload key the
 *     worker uses to find the row again.
 *   - Status transitions are written by the WORKER (server/jobs/worker.ts)
 *     to our `jobs` table, not by pg-boss. pg-boss owns retry + backoff;
 *     we own the user-visible status surface.
 *   - `get()` reads only OUR table. Tenant-firewalled like every other
 *     Real* service.
 *   - **Queue mapping derives from the policy registry (L04-S5)** — queue
 *     name === JobKind, validated by the `Record<JobKind, JobPolicy>` type,
 *     so the old hand-written switch (and its drift risk) is gone.
 *   - **Send carries the retry policy explicitly (L04-S1)** in addition to
 *     the queue-level default set in boss.ts — pg-boss send options silently
 *     fall back to library defaults otherwise.
 *   - **`listRecentRuns` is a platform-scope read (L05-S3)**: it is NOT
 *     tenant-filtered because scheduled runs live under the PLATFORM_ORG_ID
 *     sentinel. The calling route MUST gate on super_admin; the service
 *     asserts it was constructed WITHOUT a tenant resolver to make misuse
 *     from a tenant-scoped path loud instead of silent.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { IJobService, Job, JobCreateInput, JobKind } from '../../shared/contracts/job'
import { getDb } from '../db/client'
import { jobs } from '../db/schema/jobs'
import type { Job as DbJob } from '../db/schema/jobs'
import { getBoss } from '../jobs/boss'
import { JOB_POLICIES } from '../jobs/policy'
import { assertSameTenant, resolveActorUserId, type TenantResolver } from './_tenant'
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
        actorUserId: resolveActorUserId(this.tenantResolver),
        after: { kind: input.kind },
      })
      return r!
    })

    // 2. Publish to pg-boss with the kind's retry policy (L04-S1). Queue
    //    name === JobKind (policy registry). Worker pulls this and writes
    //    terminal status back to our row.
    const boss = await getBoss()
    const policy = JOB_POLICIES[input.kind]
    await boss.send(
      input.kind,
      {
        jobId: row.id,
        organizationId: row.organizationId,
        kind: row.kind,
        payload: row.payload,
      },
      {
        retryLimit: policy.retryLimit,
        retryDelay: policy.retryDelay,
        retryBackoff: policy.retryBackoff,
        expireInSeconds: policy.expireInSeconds,
      },
    )

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

  async listRecentRuns(input: { kinds: JobKind[]; limit?: number }): Promise<Job[]> {
    // Platform-scope read: refuse to serve a tenant-scoped construction so
    // this can never become an accidental cross-tenant list endpoint. The
    // super-admin route constructs the service with NO resolver (like the
    // worker does) after verifying the session role.
    if (this.tenantResolver?.()) {
      throw new Error(
        'listRecentRuns is a platform-scope read; construct RealJobService without a tenant resolver (super_admin route only).',
      )
    }
    if (input.kinds.length === 0) return []
    const db = getDb()
    const rows = await db
      .select()
      .from(jobs)
      .where(and(inArray(jobs.kind, input.kinds), sql`${jobs.deletedAt} IS NULL`))
      .orderBy(desc(jobs.createdAt))
      .limit(Math.min(input.limit ?? 20, 100))
    return rows.map(rowToContract)
  }
}
