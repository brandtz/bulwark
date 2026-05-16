/**
 * tests/unit/program.test.ts — Wave 1A / EH-A acceptance.
 *
 * # Decisions (ADR-0008, ADR-0013)
 *   - Construct `MockProgramService` directly (not through the factory)
 *     so each test owns a fresh resolver and we exercise the tenant
 *     firewall without Nuxt context.
 *   - We assert the BEHAVIOURAL contract (idempotent assignment,
 *     built-in delete refusal, slug uniqueness scoped to org) rather
 *     than the shape of returned rows — that's covered by the Zod
 *     contracts themselves.
 *
 * # Decision cast down
 *   - Rejected: testing real backend through a DB. That's e2e territory
 *     and would couple unit run-time to Postgres availability.
 */
import { describe, it, expect } from 'vitest'
import { MockProgramService } from '~~/shared/mocks/program.mock'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'

const orgResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('MockProgramService (Wave 1A / EH-A)', () => {
  it('lists the seeded built-in Wildfire Retrofit program for the active org', async () => {
    const svc = new MockProgramService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 20 })
    const wildfire = out.rows.find((p) => p.slug === 'wildfire-retrofit')
    expect(wildfire).toBeDefined()
    expect(wildfire?.isBuiltin).toBe(true)
  })

  it('refuses to soft-delete a built-in program', async () => {
    const svc = new MockProgramService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 5 })
    const wildfire = out.rows.find((p) => p.slug === 'wildfire-retrofit')!
    await expect(svc.softDelete(wildfire.id, FIXTURE_ORG_ID)).rejects.toThrow(/built-in/i)
  })

  it('rejects duplicate slug within the same org', async () => {
    const svc = new MockProgramService(orgResolver)
    await expect(
      svc.create({
        organizationId: FIXTURE_ORG_ID,
        slug: 'wildfire-retrofit', // collides with seeded builtin
        name: 'Wildfire (custom)',
        kind: 'inspection_program',
      }),
    ).rejects.toThrow(/slug/i)
  })

  it('allows the same slug in a different org', async () => {
    const otherResolver: TenantResolver = () => ({
      userId: FIXTURE_USER_ADMIN.userId,
      organizationId: FIXTURE_ORG_ID_2,
    })
    const svc = new MockProgramService(otherResolver)
    const created = await svc.create({
      organizationId: FIXTURE_ORG_ID_2,
      slug: 'wildfire-retrofit-org2',
      name: 'Wildfire (org2 custom)',
      kind: 'inspection_program',
    })
    expect(created.organizationId).toBe(FIXTURE_ORG_ID_2)
  })

  it('rejects cross-tenant list', async () => {
    const svc = new MockProgramService(orgResolver)
    await expect(
      svc.list({ organizationId: FIXTURE_ORG_ID_2, page: 1, pageSize: 5 }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('assignToEntity is idempotent (second call returns same membership id)', async () => {
    const svc = new MockProgramService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 5 })
    const wildfire = out.rows.find((p) => p.slug === 'wildfire-retrofit')!
    const entityId = '00000000-0000-4000-8000-000000000001'
    const input = {
      organizationId: FIXTURE_ORG_ID,
      programId: wildfire.id,
      entityType: 'property' as const,
      entityId,
    }
    const first = await svc.assignToEntity(input)
    const second = await svc.assignToEntity(input)
    expect(second.id).toBe(first.id)
  })

  it('unassignFromEntity removes the membership', async () => {
    const svc = new MockProgramService(orgResolver)
    const out = await svc.list({ organizationId: FIXTURE_ORG_ID, page: 1, pageSize: 5 })
    const wildfire = out.rows.find((p) => p.slug === 'wildfire-retrofit')!
    const entityId = '00000000-0000-4000-8000-000000000002'
    await svc.assignToEntity({
      organizationId: FIXTURE_ORG_ID,
      programId: wildfire.id,
      entityType: 'property',
      entityId,
    })
    await svc.unassignFromEntity({
      organizationId: FIXTURE_ORG_ID,
      programId: wildfire.id,
      entityType: 'property',
      entityId,
    })
    const memberships = await svc.listMembershipsFor({
      organizationId: FIXTURE_ORG_ID,
      entityType: 'property',
      entityId,
    })
    expect(memberships).toHaveLength(0)
  })
})
