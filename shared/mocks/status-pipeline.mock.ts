/**
 * shared/mocks/status-pipeline.mock.ts — MockStatusPipelineService
 * (Wave 1B / EH-H Part A / W1-3 / ADR-0023).
 *
 * # Decisions (ADR-0004, ADR-0008, ADR-0023)
 *   - Module-level `pipelineRows` + `nodeRows` arrays so the singleton
 *     factory instance shares state across the request — same shape
 *     as `MockProgramService`.
 *   - Pre-seeded at module load: every demo org × every entity type
 *     gets v1 from `DEFAULT_PIPELINES`. Otherwise the kanban screens
 *     load against an empty pipeline on first paint and the tests
 *     would each have to call `bootstrap` manually.
 *   - `save()` mutates atomically in the mock world: deactivate the
 *     current active row, append a new row + nodes at `version+1`.
 *   - `canTransition()` reads the active pipeline; if absent it auto-
 *     bootstraps (the same defensive behaviour the real service
 *     ships with so W1-4 never crashes on a fresh org).
 */
import type {
  CanTransitionInput,
  CanTransitionOutput,
  IStatusPipelineService,
  StatusPipeline,
  StatusPipelineEntityType,
  StatusPipelineFull,
  StatusPipelineListOutput,
  StatusPipelineNode,
  StatusPipelineSaveInput,
} from '../contracts/status-pipeline'
import { DEFAULT_PIPELINES } from '../pipelines/defaults'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2 } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()
const NOW = '2026-05-14T20:00:00.000Z'

const pipelineRows: StatusPipeline[] = []
const nodeRows: StatusPipelineNode[] = []

function buildFromDefaults(
  organizationId: string,
  entityType: StatusPipelineEntityType,
  version: number,
  initialActive: boolean,
): StatusPipelineFull {
  const pipelineId = newId()
  const created = NOW
  const pipeline: StatusPipeline = {
    id: pipelineId,
    organizationId,
    entityType,
    version,
    isActive: initialActive,
    createdAt: created,
    updatedAt: created,
    deletedAt: null,
  }
  const nodes: StatusPipelineNode[] = DEFAULT_PIPELINES[entityType].nodes.map((n) => ({
    id: newId(),
    pipelineId,
    slug: n.slug,
    labelKey: n.labelKey,
    color: n.color,
    description: n.description ?? null,
    sortOrder: n.sortOrder,
    isInitial: n.isInitial,
    isTerminal: n.isTerminal,
    allowedTransitions: [...n.allowedTransitions],
    createdAt: created,
    updatedAt: created,
    deletedAt: null,
  }))
  return { ...pipeline, nodes }
}

// Pre-seed both demo orgs × all entity types.
;(function seedDefaults() {
  for (const org of [FIXTURE_ORG_ID, FIXTURE_ORG_ID_2]) {
    for (const entityType of Object.keys(DEFAULT_PIPELINES) as StatusPipelineEntityType[]) {
      const full = buildFromDefaults(org, entityType, 1, true)
      pipelineRows.push({
        id: full.id,
        organizationId: full.organizationId,
        entityType: full.entityType,
        version: full.version,
        isActive: full.isActive,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
        deletedAt: null,
      })
      nodeRows.push(...full.nodes)
    }
  }
})()

function nodesFor(pipelineId: string): StatusPipelineNode[] {
  return nodeRows
    .filter((n) => n.pipelineId === pipelineId && !n.deletedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function fullFor(p: StatusPipeline): StatusPipelineFull {
  return { ...p, nodes: nodesFor(p.id) }
}

export class MockStatusPipelineService implements IStatusPipelineService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async getActive(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull | null> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const active = pipelineRows.find(
      (p) =>
        p.organizationId === input.organizationId &&
        p.entityType === input.entityType &&
        p.isActive &&
        !p.deletedAt,
    )
    return active ? fullFor(active) : null
  }

  async list(input: {
    organizationId: string
    entityType?: StatusPipelineEntityType
  }): Promise<StatusPipelineListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const scoped = pipelineRows
      .filter(
        (p) =>
          p.organizationId === input.organizationId &&
          (!input.entityType || p.entityType === input.entityType) &&
          !p.deletedAt,
      )
      .slice()
      .sort((a, b) => a.entityType.localeCompare(b.entityType) || b.version - a.version)
    return { rows: scoped.map(fullFor) }
  }

  async bootstrap(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const existing = await this.getActive(input)
    if (existing) return existing
    const full = buildFromDefaults(input.organizationId, input.entityType, 1, true)
    pipelineRows.push({
      id: full.id,
      organizationId: full.organizationId,
      entityType: full.entityType,
      version: full.version,
      isActive: true,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
      deletedAt: null,
    })
    nodeRows.push(...full.nodes)
    return full
  }

  /**
   * W2-3 / EH-G: append any default nodes not already present on the
   * active pipeline. Admin renames/edits to existing nodes are NEVER
   * overwritten — we match by `slug`. If no active pipeline exists,
   * delegate to bootstrap.
   */
  async reconcileWithDefaults(input: {
    organizationId: string
    entityType: StatusPipelineEntityType
  }): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const active = await this.getActive(input)
    if (!active) return this.bootstrap(input)
    const defaults = DEFAULT_PIPELINES[input.entityType].nodes
    const existingSlugs = new Set(active.nodes.map((n) => n.slug))
    const missing = defaults.filter((d) => !existingSlugs.has(d.slug))
    if (missing.length === 0) return active
    const now = nowIso()
    for (const d of missing) {
      nodeRows.push({
        id: newId(),
        pipelineId: active.id,
        slug: d.slug,
        labelKey: d.labelKey,
        color: d.color,
        description: d.description ?? null,
        sortOrder: d.sortOrder,
        isInitial: d.isInitial,
        isTerminal: d.isTerminal,
        allowedTransitions: [...d.allowedTransitions],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    }
    // Touch pipeline updatedAt for audit visibility.
    const ph = pipelineRows.find((p) => p.id === active.id)
    if (ph) ph.updatedAt = now
    return fullFor(ph!)
  }

  async save(input: StatusPipelineSaveInput): Promise<StatusPipelineFull> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    validatePipelineInput(input)
    // Deactivate prior version(s).
    const prior = pipelineRows.filter(
      (p) =>
        p.organizationId === input.organizationId &&
        p.entityType === input.entityType &&
        p.isActive &&
        !p.deletedAt,
    )
    const now = nowIso()
    for (const p of prior) {
      p.isActive = false
      p.updatedAt = now
    }
    const nextVersion =
      Math.max(
        0,
        ...pipelineRows
          .filter(
            (p) =>
              p.organizationId === input.organizationId &&
              p.entityType === input.entityType,
          )
          .map((p) => p.version),
      ) + 1
    const pipelineId = newId()
    const pipeline: StatusPipeline = {
      id: pipelineId,
      organizationId: input.organizationId,
      entityType: input.entityType,
      version: nextVersion,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const nodes: StatusPipelineNode[] = input.nodes.map((n) => ({
      id: newId(),
      pipelineId,
      slug: n.slug,
      labelKey: n.labelKey,
      color: n.color,
      description: n.description ?? null,
      sortOrder: n.sortOrder,
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
      allowedTransitions: [...n.allowedTransitions],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }))
    pipelineRows.push(pipeline)
    nodeRows.push(...nodes)
    return { ...pipeline, nodes }
  }

  async canTransition(input: CanTransitionInput): Promise<CanTransitionOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const active =
      (await this.getActive({
        organizationId: input.organizationId,
        entityType: input.entityType,
      })) ?? (await this.bootstrap({
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
