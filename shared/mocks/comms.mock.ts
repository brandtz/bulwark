/**
 * shared/mocks/comms.mock.ts — in-memory delivery health (WP-L03).
 *
 * Mirrors RealCommsService over an in-memory ledger. The mock tenant
 * context carries no role, so the admin check lives only in the real
 * service; the settings route middleware gates the panel in mock mode.
 */
import {
  DeliveryHealthInputSchema,
  type DeliveryHealthInput,
  type DeliveryChannel,
  type DeliveryCounts,
  type DeliveryHealthOutput,
  type DeliveryRow,
  type ICommsService,
} from '../contracts/delivery'
import { assertSameTenant, type TenantResolver } from './tenant'

const RECENT_FAILURE_LIMIT = 20
const ledger: DeliveryRow[] = []

export class MockCommsService implements ICommsService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async deliveryHealth(input: DeliveryHealthInput): Promise<DeliveryHealthOutput> {
    const parsed = DeliveryHealthInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, parsed.organizationId)
    const since = Date.parse(parsed.since)
    const rows = ledger.filter((r) => r.organizationId === parsed.organizationId && Date.parse(r.createdAt) >= since)
    const tally = (channel?: DeliveryChannel): DeliveryCounts => {
      const count = (status: DeliveryRow['status']) =>
        rows.filter((r) => r.status === status && (!channel || r.channel === channel)).length
      return { sent: count('sent'), stubbed: count('stubbed'), failed: count('failed') }
    }
    return {
      ...tally(),
      byChannel: { email: tally('email'), sms: tally('sms') },
      recentFailures: rows
        .filter((r) => r.status === 'failed')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, RECENT_FAILURE_LIMIT),
    }
  }
}

export function __recordMockDelivery(row: DeliveryRow): void {
  ledger.push(row)
}

export function __resetMockCommsForTests(): void {
  ledger.length = 0
}
