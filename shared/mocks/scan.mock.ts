/**
 * shared/mocks/scan.mock.ts — MockScanService (WP-X3). Mirrors the real
 * service with no scanner configured (the default everywhere but prod).
 */
import { ScanRescanInputSchema, type IScanService, type ScanRescanInput, type ScanServiceStatus, type ScanStatus } from '../contracts/scan'
import { assertSameTenant, type TenantResolver } from './tenant'

export class MockScanService implements IScanService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async status(organizationId: string): Promise<ScanServiceStatus> {
    assertSameTenant(this.tenantResolver, organizationId)
    return { provider: 'none', enabled: false }
  }

  async rescan(input: ScanRescanInput): Promise<{ status: ScanStatus }> {
    const parsed = ScanRescanInputSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid rescan input')
    assertSameTenant(this.tenantResolver, parsed.data.organizationId)
    throw new Error('Invalid rescan: no scanner is configured')
  }
}
