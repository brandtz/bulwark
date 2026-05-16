/**
 * tests/unit/inspection-template-bootstrap.test.ts —
 * W2-2 (EH-F / ADR-0019): idempotency proof for
 * `MockInspectionTemplateService.bootstrap`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MockInspectionTemplateService,
  __resetMockInspectionTemplateState,
} from '~~/shared/mocks/inspection-template.mock'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import type { TenantResolver } from '~~/shared/mocks/tenant'

const resolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('MockInspectionTemplateService.bootstrap', () => {
  beforeEach(() => { __resetMockInspectionTemplateState() })

  it('is idempotent: second call returns the same templateId with created=false', async () => {
    const svc = new MockInspectionTemplateService(resolver)
    const programId = 'prog-wildfire'
    const first = await svc.bootstrap({
      organizationId: FIXTURE_ORG_ID,
      programId,
      programSlug: 'wildfire-retrofit',
    })
    expect(first.created).toBe(true)
    const second = await svc.bootstrap({
      organizationId: FIXTURE_ORG_ID,
      programId,
      programSlug: 'wildfire-retrofit',
    })
    expect(second.created).toBe(false)
    expect(second.templateId).toBe(first.templateId)
  })

  it('seeds wildfire defaults with 8 sections', async () => {
    const svc = new MockInspectionTemplateService(resolver)
    const { templateId } = await svc.bootstrap({
      organizationId: FIXTURE_ORG_ID,
      programId: 'prog-wildfire',
      programSlug: 'wildfire-retrofit',
    })
    const tpl = await svc.getWithSections(templateId, FIXTURE_ORG_ID)
    expect(tpl).toBeTruthy()
    expect(tpl!.sections.length).toBe(8)
    const slugs = tpl!.sections.map((s) => s.slug)
    expect(slugs).toEqual([
      'zone_0', 'zone_1', 'zone_2', 'roof', 'vents', 'eaves', 'siding', 'deck',
    ])
  })

  it('creates an empty skeleton for unknown program slugs', async () => {
    const svc = new MockInspectionTemplateService(resolver)
    const { templateId } = await svc.bootstrap({
      organizationId: FIXTURE_ORG_ID,
      programId: 'prog-x',
      programSlug: 'storm-damage',
    })
    const tpl = await svc.getWithSections(templateId, FIXTURE_ORG_ID)
    expect(tpl!.sections.length).toBe(0)
  })
})
