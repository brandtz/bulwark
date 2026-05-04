/**
 * shared/mocks/assessment.mock.ts — MockAssessmentService (E4-S2).
 *
 * # Decisions (ADR-0008)
 *   - State lives in a module-level array (same pattern as property +
 *     client mocks). `factory.ts` caches the instance so all calls in a
 *     process share the same store \u2014 the kanban + detail tab + summary
 *     screen stay in sync after a create.
 *   - Tenant firewall is mandatory (E2-S7). Every method that takes an
 *     `organizationId` calls `assertSameTenant` before any data access.
 *   - `getLatestForProperty` returns the *most recent* assessment, not
 *     "the only one." Field crews redo assessments after upgrades; the
 *     summary screen and the property detail tab both want the latest.
 *
 * # Decision cast down
 *   - Rejected: pre-seeding fixture assessments. The seed data didn't
 *     ship one, and inventing one risks misaligning with the property
 *     statuses (an `assessed` property would suddenly show a stale
 *     assessment from the wrong era). E4-S2 ships an empty store; the
 *     happy-path Playwright will create the first one.
 */
import type {
  Assessment,
  AssessmentCreateInput,
  AssessmentListInput,
  AssessmentListOutput,
  IAssessmentService,
} from '../contracts/assessment'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Assessment[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockAssessmentService implements IAssessmentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: AssessmentListInput): Promise<AssessmentListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.propertyId) {
      scoped = scoped.filter((r) => r.propertyId === input.propertyId)
    }
    // Newest first.
    scoped = scoped.slice().sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : -1))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async getLatestForProperty(
    propertyId: string,
    organizationId: string,
  ): Promise<Assessment | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const scoped = rows.filter(
      (r) =>
        r.organizationId === organizationId &&
        r.propertyId === propertyId &&
        !r.deletedAt,
    )
    if (scoped.length === 0) return null
    return scoped.reduce((latest, r) => (r.assessedAt > latest.assessedAt ? r : latest))
  }

  async create(input: AssessmentCreateInput): Promise<Assessment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: Assessment = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      assessedById: input.assessedById,
      assessedAt: input.assessedAt,
      roofMaterial: input.roofMaterial,
      sidingMaterial: input.sidingMaterial,
      eaveType: input.eaveType,
      ventType: input.ventType,
      defensibleSpaceCleared: input.defensibleSpaceCleared,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }
}
