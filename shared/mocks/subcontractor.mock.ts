/**
 * shared/mocks/subcontractor.mock.ts — MockSubcontractorService (E6).
 *
 * # Decisions (ADR-0008)
 *   - Read-only in v1: list + get. Create/edit lands in E6-S5 once we
 *     have a real form to hang it off; for now the fixture set is
 *     enough to drive trade assignment.
 *   - Tenant firewall (E2-S7) on every method.
 */
import type {
  ISubcontractorService,
  Subcontractor,
  SubcontractorListInput,
  SubcontractorListOutput,
} from '../contracts/subcontractor'
import { FIXTURE_SUBCONTRACTORS } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Subcontractor[] = [...FIXTURE_SUBCONTRACTORS]

export class MockSubcontractorService implements ISubcontractorService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: SubcontractorListInput): Promise<SubcontractorListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.trade) {
      scoped = scoped.filter((r) => r.trades.includes(input.trade!))
    }
    scoped = scoped
      .slice()
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Subcontractor | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(
      (x) => x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    return r ?? null
  }
}
