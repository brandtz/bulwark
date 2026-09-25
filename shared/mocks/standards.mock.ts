/**
 * shared/mocks/standards.mock.ts — per-tenant compliance standards (E9-S3).
 *
 * # Decisions (ADR-0008)
 *   - Module-level Map keyed by orgId. Empty Map = every tenant gets the
 *     seeded Wildfire Retrofit standards fallback on first read; saving once
 *     persists the row for that org.
 *   - Tenant-firewalled per E2-S7: every method calls
 *     `assertSameTenant(resolver, orgId)`.
 *
 * # Decision cast down
 *   - Rejected: returning `null` for "never customised" tenants. The UI
 *     would then need to fall back to the program seed itself,
 *     duplicating the fallback in two places. Returning a synthetic row
 *     keeps the page logic single-branch.
 */
import type {
  ComplianceStandards,
  IStandardsService,
  StandardsRow,
} from '../contracts/standards'
import { DEFAULT_WILDFIRE_STANDARDS } from '../inspection-templates/wildfire-defaults'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows = new Map<string, StandardsRow>()

export class MockStandardsService implements IStandardsService {
  constructor(private readonly resolver?: TenantResolver) {}

  async get(orgId: string): Promise<StandardsRow> {
    assertSameTenant(this.resolver, orgId)
    const existing = rows.get(orgId)
    if (existing) return existing
    return {
      organizationId: orgId,
      standards: DEFAULT_WILDFIRE_STANDARDS,
      updatedAt: new Date().toISOString(),
      updatedById: null,
    }
  }

  async save(
    orgId: string,
    standards: ComplianceStandards,
    updatedById: string | null,
  ): Promise<StandardsRow> {
    assertSameTenant(this.resolver, orgId)
    const row: StandardsRow = {
      organizationId: orgId,
      standards,
      updatedAt: new Date().toISOString(),
      updatedById,
    }
    rows.set(orgId, row)
    return row
  }
}

export function __resetMockStandardsForTests(): void {
  rows.clear()
}
