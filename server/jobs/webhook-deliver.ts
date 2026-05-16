/**
 * server/jobs/webhook-deliver.ts — `webhook.deliver` job handler
 * (W3-1 / EH-J / ADR-0028).
 *
 * # Decisions (ADR-0028)
 *   - Moved the inline retry+POST chain out of
 *     `_subscribers/webhook-dispatcher.ts` into a queue-dispatched
 *     handler. Behaviour is identical: HMAC-SHA256 sign, POST,
 *     record a `webhook_deliveries` row, bump `failureCount` /
 *     `lastDeliveryAt`. The queue itself owns the retry timing.
 *   - The handler throws on a non-2xx response so the queue's retry
 *     loop re-enqueues. Each retry attempt writes its own
 *     `webhook_deliveries` row.
 *   - **Promotion path**: when the queue swaps to `pg-boss`, this
 *     same handler signature works as-is; `boss.work('webhook.deliver',
 *     handleWebhookDeliver)` is the only change.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { webhooks, webhookDeliveries } from '../db/schema/webhooks'
import { signWebhookPayload } from '../../shared/utils/webhook-signature'
// W3-5 / EH-Q (ADR-0034): structured logger + counters.
import { log } from '../utils/logger'
import { incCounter, COUNTERS } from '../utils/metrics'

export interface WebhookDeliverJobPayload {
  webhookId: string
  organizationId: string
  url: string
  signingKey: string
  eventName: string
  payload: unknown
}

async function attempt(opts: WebhookDeliverJobPayload, attemptNumber: number): Promise<{
  status: number | null
  body: string | null
  ok: boolean
}> {
  const body = JSON.stringify({
    eventType: opts.eventName,
    timestamp: new Date().toISOString(),
    data: opts.payload,
  })
  const sig = signWebhookPayload(body, opts.signingKey)
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bulwark-Event': opts.eventName,
        'X-Bulwark-Attempt': String(attemptNumber),
        [sig.header]: sig.value,
      },
      body,
    })
    const respBody = (await res.text().catch(() => '')).slice(0, 1000)
    return { status: res.status, body: respBody, ok: res.ok }
  } catch (err) {
    return { status: null, body: (err as Error).message.slice(0, 1000), ok: false }
  }
}

export async function handleWebhookDeliver(
  payload: WebhookDeliverJobPayload,
  ctx: { attempt: number; kind: string },
): Promise<void> {
  const db = getDb()
  const result = await attempt(payload, ctx.attempt)

  try {
    await db.insert(webhookDeliveries).values({
      organizationId: payload.organizationId,
      webhookId: payload.webhookId,
      eventType: payload.eventName,
      payload: (payload.payload ?? {}) as Record<string, unknown>,
      responseStatus: result.status,
      responseBody: result.body,
      attempt: ctx.attempt,
      deliveredAt: new Date(),
    })
  } catch (err) {
    log('error', 'webhook.persist_delivery_failed', {
      webhookId: payload.webhookId,
      error: err instanceof Error ? err.message : 'unknown',
    })
  }

  if (result.ok) {
    incCounter(COUNTERS.webhooksDeliveredTotal)
    try {
      await db
        .update(webhooks)
        .set({ failureCount: 0, lastDeliveryAt: new Date(), updatedAt: new Date() })
        .where(eq(webhooks.id, payload.webhookId))
    } catch (err) {
      log('error', 'webhook.clear_failure_count_failed', {
        webhookId: payload.webhookId,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
    return
  }

  incCounter(COUNTERS.webhooksFailedTotal)
  // Non-2xx → bump failure stat then throw so the queue retries.
  try {
    const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, payload.webhookId)).limit(1)
    if (hook) {
      await db
        .update(webhooks)
        .set({
          failureCount: (hook.failureCount ?? 0) + 1,
          lastDeliveryAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, payload.webhookId))
    }
  } catch (err) {
    log('error', 'webhook.bump_failure_count_failed', {
      webhookId: payload.webhookId,
      error: err instanceof Error ? err.message : 'unknown',
    })
  }
  throw new Error(`webhook delivery non-2xx: status=${result.status ?? 'network-error'}`)
}
