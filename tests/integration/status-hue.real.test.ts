/**
 * tests/integration/status-hue.real.test.ts — WP-X5 against Postgres.
 *
 * A bootstrapped pipeline carries the design hue per built-in status; a
 * colour-only save (the legacy editor) keeps each node's hue unless its colour
 * changed; an explicit hue wins; an unknown hue is refused and nothing is saved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import bcrypt from 'bcryptjs'
import { auditLog, organizations, statusPipelineNodes, statusPipelines, users } from '../../server/db/schema'
import { RealStatusPipelineService } from '../../server/services/status-pipeline.real'
import type { StatusPipelineNodeInput } from '../../shared/contracts/status-pipeline'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('status hues on the real pipeline service (WP-X5)', () => {
  let orgId: string
  let userId: string
  const svc = () => new RealStatusPipelineService(() => ({ organizationId: orgId, userId }))

  beforeAll(async () => {
    const [o] = await getDb().insert(organizations).values({ name: 'X5 hues', slug: `x5-hues-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }).returning()
    orgId = o!.id
    const [u] = await getDb().insert(users).values({ email: `x5-${Date.now()}@x.test`, fullName: 'X5', passwordHash: await bcrypt.hash('x', 4), isActive: true }).returning()
    userId = u!.id
  })

  afterAll(async () => {
    const db = getDb()
    const pipes = await db.select({ id: statusPipelines.id }).from(statusPipelines).where(eq(statusPipelines.organizationId, orgId))
    if (pipes.length) await db.delete(statusPipelineNodes).where(inArray(statusPipelineNodes.pipelineId, pipes.map((p) => p.id)))
    await db.delete(statusPipelines).where(eq(statusPipelines.organizationId, orgId))
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(users).where(eq(users.id, userId))
  })

  const asInput = (nodes: Array<{ slug: string, labelKey: string, color: string, sortOrder: number, isInitial: boolean, isTerminal: boolean, requiresReason: boolean, allowedTransitions: string[] }>): StatusPipelineNodeInput[] =>
    nodes.map(({ slug, labelKey, color, sortOrder, isInitial, isTerminal, requiresReason, allowedTransitions }) => ({ slug, labelKey, color, sortOrder, isInitial, isTerminal, requiresReason, allowedTransitions }))

  it('bootstraps built-in statuses with their design hues', async () => {
    const p = await svc().bootstrap({ organizationId: orgId, entityType: 'property' })
    const hue = Object.fromEntries(p.nodes.map((n) => [n.slug, n.hue]))
    expect(hue).toMatchObject({ lead: 'slate', scheduled: 'blue', accepted: 'teal', in_progress: 'amber', paid: 'green' })
  })

  it('a colour-only save keeps hues; a changed colour or an explicit hue changes one node', async () => {
    const active = (await svc().getActive({ organizationId: orgId, entityType: 'property' }))!
    const nodes = asInput(active.nodes).map((n) =>
      n.slug === 'quoted' ? { ...n, color: '#DC2626' } // colour changed → nearest hue
        : n.slug === 'lead' ? { ...n, hue: 'gray' as const } // explicit hue
          : n) // unchanged colour, no hue → keeps its hue
    const saved = await svc().save({ organizationId: orgId, entityType: 'property', nodes })
    const hue = Object.fromEntries(saved.nodes.map((n) => [n.slug, n.hue]))
    expect(hue.accepted).toBe('teal')
    expect(hue.in_progress).toBe('amber')
    expect(hue.quoted).toBe('red')
    expect(hue.lead).toBe('gray')
    const row = await getDb().select({ hue: statusPipelineNodes.hue }).from(statusPipelineNodes)
      .where(eq(statusPipelineNodes.pipelineId, saved.id))
    expect(row.every((r) => typeof r.hue === 'string' && r.hue.length > 0)).toBe(true)
  })

  it('refuses an unknown hue and leaves the active version unchanged', async () => {
    const before = (await svc().getActive({ organizationId: orgId, entityType: 'property' }))!
    const nodes = asInput(before.nodes).map((n, i) => (i === 0 ? { ...n, hue: 'chartreuse' as never } : n))
    await expect(svc().save({ organizationId: orgId, entityType: 'property', nodes })).rejects.toThrow(/unknown status hue/u)
    const after = (await svc().getActive({ organizationId: orgId, entityType: 'property' }))!
    expect(after.version).toBe(before.version)
  })
})
