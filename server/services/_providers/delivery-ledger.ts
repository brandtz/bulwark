import { createHmac } from 'node:crypto'
import type { DeliveryChannel, DeliveryStatus } from '../../../shared/contracts/delivery'
import { getDb } from '../../db/client'
import { messageDeliveries } from '../../db/schema/message_deliveries'
import { log } from '../../utils/logger'

export interface DeliveryAttemptInput {
  organizationId: string
  channel: DeliveryChannel
  provider: string
  recipient: string
  status: DeliveryStatus
  providerMessageId?: string | null
  error?: string | null
  eventType?: string | null
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  /** Provider HTTP attempts made for this delivery (bounded retries). */
  attempt?: number
}

function recipientHash(recipient: string): string {
  const key = process.env.JWT_SECRET
    ?? process.env.NUXT_SESSION_PASSWORD
    ?? 'bulwark-development-delivery-ledger-key'
  return createHmac('sha256', key).update(recipient.trim().toLowerCase()).digest('hex')
}

export async function recordDeliveryAttempt(input: DeliveryAttemptInput): Promise<void> {
  try {
    await getDb().insert(messageDeliveries).values({
      organizationId: input.organizationId,
      channel: input.channel,
      provider: input.provider,
      recipientHash: recipientHash(input.recipient),
      status: input.status,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error?.slice(0, 500) ?? null,
      eventType: input.eventType ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      attempt: Math.max(1, input.attempt ?? 1),
    })
  } catch (error) {
    log('error', 'comms.delivery_ledger_write_failed', {
      organizationId: input.organizationId,
      channel: input.channel,
      provider: input.provider,
      status: input.status,
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
}