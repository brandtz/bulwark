/**
 * tests/unit/status-pipeline.test.ts — Wave 1B / EH-H Part A / W1-3.
 *
 * Behaviour-level tests for MockStatusPipelineService. Mirrors program.test.
 */
import { describe, it, expect } from 'vitest'
import { MockStatusPipelineService } from '~~/shared/mocks/status-pipeline.mock'
import { DEFAULT_PIPELINES } from '~~/shared/pipelines/defaults'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import {
  PropertyStatusSchema,
  QuoteStatusSchema,
  WorkOrderStatusSchema,
  InvoiceStatusSchema,
} from '~~/shared/contracts'

const orgResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('MockStatusPipelineService (Wave 1B / EH-H / W1-3)', () => {
  it('pre-seeds default pipelines for all entity types', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID })
    const entities = new Set(out.rows.map((r) => r.entityType))
    expect(entities.has('property')).toBe(true)
    expect(entities.has('quote')).toBe(true)
    expect(entities.has('work_order')).toBe(true)
    expect(entities.has('invoice')).toBe(true)
    expect(entities.has('compliance')).toBe(true)
    expect(entities.has('job')).toBe(true)
  })

  it('default property pipeline covers every PropertyStatus enum value', () => {
    const enumValues = new Set(PropertyStatusSchema.options)
    const defaultSlugs = new Set(DEFAULT_PIPELINES.property.nodes.map((n) => n.slug))
    // Pipeline may include MORE slugs than the enum (admin-extendable), but
    // every enum value must be present so the boot UI never references an
    // unknown status.
    for (const v of enumValues) {
      expect(defaultSlugs.has(v)).toBe(true)
    }
  })

  it('default pipelines for quote / WO / invoice align with their enums', () => {
    for (const v of QuoteStatusSchema.options) {
      expect(new Set(DEFAULT_PIPELINES.quote.nodes.map((n) => n.slug)).has(v)).toBe(true)
    }
    for (const v of WorkOrderStatusSchema.options) {
      expect(new Set(DEFAULT_PIPELINES.work_order.nodes.map((n) => n.slug)).has(v)).toBe(true)
    }
    for (const v of InvoiceStatusSchema.options) {
      expect(new Set(DEFAULT_PIPELINES.invoice.nodes.map((n) => n.slug)).has(v)).toBe(true)
    }
  })

  it('canTransition allows transitions declared in allowedTransitions', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const out = await svc.canTransition({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'quote',
      fromSlug: 'draft',
      toSlug: 'sent',
    })
    expect(out.allowed).toBe(true)
  })

  it('canTransition rejects transitions NOT in allowedTransitions', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const out = await svc.canTransition({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'quote',
      fromSlug: 'draft',
      toSlug: 'accepted', // draft can only go to 'sent'
    })
    expect(out.allowed).toBe(false)
    expect(out.reason).toMatch(/not permitted/i)
  })

  it('canTransition rejects unknown slugs with a reason', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const out = await svc.canTransition({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'quote',
      fromSlug: 'draft',
      toSlug: 'no_such_status',
    })
    expect(out.allowed).toBe(false)
    expect(out.reason).toMatch(/unknown/i)
  })

  it('canTransition treats same slug as a no-op (allowed)', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const out = await svc.canTransition({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'quote',
      fromSlug: 'draft',
      toSlug: 'draft',
    })
    expect(out.allowed).toBe(true)
  })

  it('save() bumps version, activates the new one, deactivates prior', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    const before = await svc.getActive({ organizationId: FIXTURE_ORG_ID, entityType: 'job' })
    expect(before?.version).toBe(1)
    const saved = await svc.save({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'job',
      nodes: [
        { slug: 'pending', labelKey: 'status.job.pending', color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['done'] },
        { slug: 'done', labelKey: 'status.job.done', color: '#10B981', description: null, sortOrder: 20, isInitial: false, isTerminal: true, allowedTransitions: [] },
      ],
    })
    expect(saved.version).toBe(2)
    expect(saved.isActive).toBe(true)
    const after = await svc.getActive({ organizationId: FIXTURE_ORG_ID, entityType: 'job' })
    expect(after?.id).toBe(saved.id)
    expect(after?.version).toBe(2)
  })

  it('save() rejects 0 initial or 0 terminal nodes', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    await expect(
      svc.save({
        organizationId: FIXTURE_ORG_ID,
        entityType: 'job',
        nodes: [
          { slug: 'a', labelKey: 'a', color: '#94A3B8', description: null, sortOrder: 1, isInitial: false, isTerminal: true, allowedTransitions: [] },
          { slug: 'b', labelKey: 'b', color: '#94A3B8', description: null, sortOrder: 2, isInitial: false, isTerminal: true, allowedTransitions: [] },
        ],
      }),
    ).rejects.toThrow(/initial/i)
  })

  it('rejects cross-tenant access via tenant firewall', async () => {
    const svc = new MockStatusPipelineService(orgResolver)
    await expect(
      svc.getActive({ organizationId: FIXTURE_ORG_ID_2, entityType: 'quote' }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})
