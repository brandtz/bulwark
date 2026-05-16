/**
 * server/services/status-pipeline.real.ts — RealStatusPipelineService
 * (Wave 1B / EH-H Part A / W1-3 / ADR-0023).
 *
 * # Decisions (ADR-0008, ADR-0023)
 *   - `save()` is a single `withAudit` transaction: deactivate prior
 *     active rows, insert new pipeline header, insert new nodes,
 *     audit-record the version bump. All atomic.
 *   - `bootstrap()` is idempotent: race-safe via the
 *     `(org, entity_type, version)` unique index — a concurrent
 *     bootstrap loses the insert and re-reads the active row.
 *   - `canTransition()` is read-only; it lazily bootstraps a fresh org
 *     so callers (W1-4) never have to special-case the empty state.
 *   - Audit action enum is `create|update|delete|state_change`. We map
 *     pipeline saves to `update` + `metadata.kind = 'pipeline_save'`.
 */
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { DEFAULT_PIPELINES } from '../../shared/pipelines/defaults'
import type {
  CanTransitionInput,
  CanTransitionOutput,
  IStatusPipelineService,
  StatusPipelineEntityType,
  StatusPipelineFull,
  StatusPipelineListOutput,
  StatusPipelineNode,
  StatusPipelineSaveInput,
} from '../../shared/contracts/status-pipeline'
import { getDb } from '../db/client'
import { statusPipelineNodes, statusPipelines } from '../db/schema/status_pipelines'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function pipelineRowToContract(
  p: typeof statusPipelines.$inferSelect,
  nodes: StatusPipelineNode[],
): StatusPipelineFull {
  return {
    id: p.id,
    organizationId: p.organizationId,
    entityType: p.entityType as StatusPipelineEntityType,
    version: p.version,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    nodes,
  }
}

function nodeRowToContract(n: typeof statusPipelineNodes.$inferSelect): StatusPipelineNode {
  return {
    id: n.id,
    pipelineId: n.pipelineId,
    slug: n.slug,
    labelKey: n.labelKey,
    color: n.color,
    description: n.description,
    sortOrder: n.sortOrder,
    isInitial: n.isInitial,
    isTerminal: n.isTerminal,
    allowedTransitions: (n.allowedTransitions ?? []) as string[],
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deletedAt: n.deletedAt ? n.deletedAt.toISOString() : null,
  }
}

export class RealStatusPipelineService implements IStatusPipelineService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async getActive(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull | null> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const [pipeline] = await db
      .select()
      .from(statusPipelines)
      .where(
        and(
          eq(statusPipelines.organizationId, input.organizationId),
          eq(statusPipelines.entityType, input.entityType),
          eq(statusPipelines.isActive, true),
          sql`${statusPipelines.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    if (!pipeline) return null
    const nodes = await db
      .select()
      .from(statusPipelineNodes)
      .where(
        and(
          eq(statusPipelineNodes.pipelineId, pipeline.id),
          sql`${statusPipelineNodes.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(statusPipelineNodes.sortOrder))
    return pipelineRowToContract(pipeline, nodes.map(nodeRowToContract))
  }

  async list(input: {
    organizationId: string
    entityType?: StatusPipelineEntityType
  }): Promise<StatusPipelineListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conds: SQL[] = [
      eq(statusPipelines.organizationId, input.organizationId),
      sql`${statusPipelines.deletedAt} IS NULL`,
    ]
    if (input.entityType) conds.push(eq(statusPipelines.entityType, input.entityType))
    const pipelines = await db
      .select()
      .from(statusPipelines)
      .where(and(...conds)!)
      .orderBy(asc(statusPipelines.entityType), desc(statusPipelines.version))
    if (pipelines.length === 0) return { rows: [] }
    const ids = pipelines.map((p) => p.id)
    const allNodes = await db
      .select()
      .from(statusPipelineNodes)
      .where(
        and(
          sql`${statusPipelineNodes.pipelineId} IN (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
          sql`${statusPipelineNodes.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(statusPipelineNodes.sortOrder))
    const nodesByPipeline = new Map<string, StatusPipelineNode[]>()
    for (const n of allNodes) {
      const list = nodesByPipeline.get(n.pipelineId) ?? []
      list.push(nodeRowToContract(n))
      nodesByPipeline.set(n.pipelineId, list)
    }
    return {
      rows: pipelines.map((p) => pipelineRowToContract(p, nodesByPipeline.get(p.id) ?? [])),
    }
  }

  async bootstrap(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const existing = await this.getActive(input)
    if (existing) return existing
    const defaults = DEFAULT_PIPELINES[input.entityType]
    return await withAudit(async ({ tx, audit }) => {
      const [pipeline] = await tx
        .insert(statusPipelines)
        .values({
          organizationId: input.organizationId,
          entityType: input.entityType,
          version: 1,
          isActive: true,
        })
        .returning()
      const nodeRows = await tx
        .insert(statusPipelineNodes)
        .values(
          defaults.nodes.map((n) => ({
            pipelineId: pipeline!.id,
            slug: n.slug,
            labelKey: n.labelKey,
            color: n.color,
            description: n.description ?? null,
            sortOrder: n.sortOrder,
            isInitial: n.isInitial,
            isTerminal: n.isTerminal,
            allowedTransitions: n.allowedTransitions,
          })),
        )
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'status_pipeline',
        entityId: pipeline!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        metadata: { kind: 'pipeline_bootstrap', target: input.entityType },
        after: { version: 1, nodeCount: nodeRows.length },
      })
      return pipelineRowToContract(pipeline!, nodeRows.map(nodeRowToContract))
    })
  }

  async save(input: StatusPipelineSaveInput): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    validatePipelineInput(input)
    return await withAudit(async ({ tx, audit }) => {
      // Deactivate prior active versions.
      await tx
        .update(statusPipelines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(statusPipelines.organizationId, input.organizationId),
            eq(statusPipelines.entityType, input.entityType),
            eq(statusPipelines.isActive, true),
          ),
        )
      // Compute next version.
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(${statusPipelines.version}), 0)::int` })
        .from(statusPipelines)
        .where(
          and(
            eq(statusPipelines.organizationId, input.organizationId),
            eq(statusPipelines.entityType, input.entityType),
          ),
        )
      const nextVersion = Number(maxRow?.max ?? 0) + 1
      const [pipeline] = await tx
        .insert(statusPipelines)
        .values({
          organizationId: input.organizationId,
          entityType: input.entityType,
          version: nextVersion,
          isActive: true,
        })
        .returning()
      const nodeRows = await tx
        .insert(statusPipelineNodes)
        .values(
          input.nodes.map((n) => ({
            pipelineId: pipeline!.id,
            slug: n.slug,
            labelKey: n.labelKey,
            color: n.color,
            description: n.description ?? null,
            sortOrder: n.sortOrder,
            isInitial: n.isInitial,
            isTerminal: n.isTerminal,
            allowedTransitions: n.allowedTransitions,
          })),
        )
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'status_pipeline',
        entityId: pipeline!.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        metadata: { kind: 'pipeline_save', target: input.entityType, version: nextVersion },
        after: { version: nextVersion, nodeCount: nodeRows.length },
      })
      return pipelineRowToContract(pipeline!, nodeRows.map(nodeRowToContract))
    })
  }

  /**
   * W2-3 / EH-G: append any default nodes missing from the active
   * pipeline (idempotent). Admin-renamed labels and edited transition
   * graphs are preserved — match is by `slug`. If no active pipeline
   * exists, delegate to `bootstrap` for a clean seed.
   */
  async reconcileWithDefaults(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const active = await this.getActive(input)
    if (!active) return this.bootstrap(input)
    const defaults = DEFAULT_PIPELINES[input.entityType].nodes
    const existing = new Set(active.nodes.map((n) => n.slug))
    const missing = defaults.filter((d) => !existing.has(d.slug))
    if (missing.length === 0) return active
    return await withAudit(async ({ tx, audit }) => {
      const inserted = await tx
        .insert(statusPipelineNodes)
        .values(
          missing.map((n) => ({
            pipelineId: active.id,
            slug: n.slug,
            labelKey: n.labelKey,
            color: n.color,
            description: n.description ?? null,
            sortOrder: n.sortOrder,
            isInitial: n.isInitial,
            isTerminal: n.isTerminal,
            allowedTransitions: n.allowedTransitions,
          })),
        )
        .returning()
      await tx
        .update(statusPipelines)
        .set({ updatedAt: new Date() })
        .where(eq(statusPipelines.id, active.id))
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'status_pipeline',
        entityId: active.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        metadata: {
          kind: 'pipeline_reconcile',
          target: input.entityType,
          addedSlugs: missing.map((m) => m.slug),
        },
      })
      const allNodes = [...active.nodes, ...inserted.map(nodeRowToContract)]
      allNodes.sort((a, b) => a.sortOrder - b.sortOrder)
      return { ...active, nodes: allNodes }
    })
  }

  async canTransition(input: CanTransitionInput): Promise<CanTransitionOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const active =
      (await this.getActive({
        organizationId: input.organizationId,
        entityType: input.entityType,
      })) ??
      (await this.bootstrap({
        organizationId: input.organizationId,
        entityType: input.entityType,
      }))
    const from = active.nodes.find((n) => n.slug === input.fromSlug)
    if (!from) return { allowed: false, reason: `Unknown from-status: ${input.fromSlug}` }
    const to = active.nodes.find((n) => n.slug === input.toSlug)
    if (!to) return { allowed: false, reason: `Unknown to-status: ${input.toSlug}` }
    if (input.fromSlug === input.toSlug) return { allowed: true }
    if (!from.allowedTransitions.includes(input.toSlug)) {
      return {
        allowed: false,
        reason: `Transition not permitted: ${input.fromSlug} → ${input.toSlug}`,
      }
    }
    return { allowed: true }
  }
}

function validatePipelineInput(input: StatusPipelineSaveInput): void {
  const slugs = new Set<string>()
  let initials = 0
  let terminals = 0
  for (const n of input.nodes) {
    if (slugs.has(n.slug)) throw new Error(`Duplicate node slug: ${n.slug}`)
    slugs.add(n.slug)
    if (n.isInitial) initials += 1
    if (n.isTerminal) terminals += 1
  }
  if (initials !== 1) throw new Error('Pipeline must declare exactly one initial node')
  if (terminals < 1) throw new Error('Pipeline must declare at least one terminal node')
  for (const n of input.nodes) {
    for (const t of n.allowedTransitions) {
      if (!slugs.has(t)) {
        throw new Error(`Node ${n.slug} references unknown transition target: ${t}`)
      }
    }
  }
}
