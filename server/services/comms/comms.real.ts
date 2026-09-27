/**
 * server/services/comms/comms.real.ts — delivery health read model (WP-L03).
 *
 * # Decisions
 *   - Reads the `message_deliveries` ledger written by the email/SMS
 *     providers. Recipients are stored only as keyed hashes, so nothing
 *     returned here can identify who a message was for.
 *   - Admin-only: the tenant firewall alone would let any member of the
 *     org read provider failure text, so the caller's membership role is
 *     checked against the org-admin set as well.
 *   - `recentFailures` is capped at 20 rows; the panel is an operator
 *     signal, not a log browser.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import {
  DeliveryHealthInputSchema,
  type DeliveryHealthInput,
  type DeliveryChannel,
  type DeliveryCounts,
  type DeliveryHealthOutput,
  type DeliveryRow,
  type ICommsService,
} from '../../../shared/contracts/delivery'
import { getDb } from '../../db/client'
import { messageDeliveries, type MessageDelivery } from '../../db/schema/message_deliveries'
import { memberships } from '../../db/schema/users'
import { assertSameTenant, ForbiddenError, type TenantResolver } from '../_tenant'

const ADMIN_ROLES = new Set(['super_admin', 'org_admin', 'org_manager'])
const RECENT_FAILURE_LIMIT = 20

function rowToContract(row: MessageDelivery): DeliveryRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    channel: row.channel as DeliveryRow['channel'],
    provider: row.provider,
    status: row.status as DeliveryRow['status'],
    providerMessageId: row.providerMessageId,
    error: row.error,
    eventType: row.eventType,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    attempt: row.attempt,
    createdAt: row.createdAt.toISOString(),
  }
}

export class RealCommsService implements ICommsService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private async assertAdmin(organizationId: string): Promise<void> {
    const actor = this.tenantResolver?.()
    if (!actor) return
    const [membership] = await getDb()
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, actor.userId), eq(memberships.organizationId, organizationId)))
      .limit(1)
    if (!membership || !ADMIN_ROLES.has(membership.role)) {
      throw new ForbiddenError('Forbidden: delivery health requires an organization admin')
    }
  }

  async deliveryHealth(input: DeliveryHealthInput): Promise<DeliveryHealthOutput> {
    const parsed = DeliveryHealthInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, parsed.organizationId)
    await this.assertAdmin(parsed.organizationId)

    const db = getDb()
    const window = and(
      eq(messageDeliveries.organizationId, parsed.organizationId),
      gte(messageDeliveries.createdAt, new Date(parsed.since)),
    )
    const counts = await db
      .select({ channel: messageDeliveries.channel, status: messageDeliveries.status, count: sql<number>`count(*)::int` })
      .from(messageDeliveries)
      .where(window)
      .groupBy(messageDeliveries.channel, messageDeliveries.status)
    const failures = await db
      .select()
      .from(messageDeliveries)
      .where(and(window, eq(messageDeliveries.status, 'failed')))
      .orderBy(desc(messageDeliveries.createdAt))
      .limit(RECENT_FAILURE_LIMIT)

    const tally = (channel?: DeliveryChannel): DeliveryCounts => {
      const sum = (status: string) => counts
        .filter((c) => c.status === status && (!channel || c.channel === channel))
        .reduce((total, c) => total + c.count, 0)
      return { sent: sum('sent'), stubbed: sum('stubbed'), failed: sum('failed') }
    }
    return {
      ...tally(),
      byChannel: { email: tally('email'), sms: tally('sms') },
      recentFailures: failures.map(rowToContract),
    }
  }
}
