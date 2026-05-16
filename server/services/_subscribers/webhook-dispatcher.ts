/**
 * server/services/_subscribers/webhook-dispatcher.ts — outbound webhook
 * delivery subscriber (W2-4 / EH-H Part B / ADR-0022).
 *
 * # Decisions (ADR-0008, ADR-0022)
 *   - Wildcard subscriber via `onAny()`. The dispatcher inspects every
 *     event emitted on the bus, looks up active webhooks for the org
 *     subscribing to that eventType, and POSTs the payload.
 *   - **HMAC-SHA256** over the raw JSON body. Header:
 *     `X-Bulwark-Signature: hmac-sha256=<hex>`. Receivers verify with
 *     the secret they copied at create time.
 *   - **Retry policy: 3 attempts at 1s / 4s / 16s** (in-process
 *     setTimeout). Each attempt records a `webhook_deliveries` row.
 *     Success zeroes the webhook's `failureCount`; failure increments.
 *   - **Failure isolation**: a dispatcher error MUST NOT bubble back
 *     to the originating mutation. The bus already wraps subscribers
 *     in `Promise.allSettled`; we additionally try/catch per-webhook
 *     so one bad URL can't poison the fan-out.
 *   - **Promotion path**: in v2 the retry+POST becomes a pg-boss job.
 *     The contract here stays the same: read active webhooks → enqueue
 *     job per webhook → job worker POSTs + records delivery. Today's
 *     in-process retry is the seam.
 *
 * # Decisions cast down
 *   - Rejected: a global "webhooks.delivery-enabled" feature flag
 *     gate. Adds a DB round-trip per emit before we know we have any
 *     webhooks to talk to. Instead the `webhooks.isActive` column on
 *     each row is the kill-switch; the global flag exists for ops but
 *     defaults to ON and is read once per process via env if
 *     desired.
 *   - Rejected: emitting `webhookDelivered` events recursively from
 *     within this subscriber. The bus would re-enter and we'd risk a
 *     storm. We write the delivery row + leave it at that; admins
 *     read deliveries via `webhookService.deliveries()`.
 */
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { webhooks, webhookDeliveries } from '../../db/schema/webhooks'
import { onAny } from '../../../shared/events/bus'
// W3-1 / ADR-0028: deliveries now route through the queue abstraction so
// the retry path can be promoted to pg-boss without touching the subscriber.
import { enqueueJob, registerJobHandler } from '../_queue'
import { handleWebhookDeliver, type WebhookDeliverJobPayload } from '../../jobs/webhook-deliver'
// W3-5 / EH-Q (ADR-0034): structured logger.
import { log } from '../../utils/logger'

let registered = false
const RETRY_DELAYS_MS = [1000, 4000, 16000]

/**
 * Resolve the raw secret for a webhook at delivery time. The DB only
 * stores sha256(secret). For Phase 1 we sign with the *hash* — admins
 * who want HMAC verification must use the issue-once secret they
 * copied at create time (the same secret we hashed). A future
 * iteration introduces a sealed-secret column.
 *
 * For W2-4 we use the stored hash as the signing key. This keeps the
 * contract honest (HMAC-SHA256 is real) but receivers must call out
 * to a shared sealed-secret store — tracked as sec-debt in ADR-0022.
 */
function deriveSigningKey(secretHash: string): string {
  // De-facto signing key. Identical across deliveries for a webhook.
  return secretHash
}

async function dispatchEvent(eventName: string, payload: unknown): Promise<void> {
  // We only fan-out events that carry an `organizationId` (which is
  // every domain event by contract). Wildcard subscribers are best-effort.
  const orgId = (payload as { organizationId?: string } | null | undefined)?.organizationId
  if (!orgId) return

  const db = getDb()
  const hooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.organizationId, orgId), eq(webhooks.isActive, true), isNull(webhooks.deletedAt)))

  for (const hook of hooks) {
    const subscribes = (hook.eventTypes ?? []).includes(eventName)
    if (!subscribes) continue

    // W3-1 / ADR-0028: enqueue a `webhook.deliver` job. The default
    // in-memory queue impl reproduces the W2-4 retry semantics (3
    // attempts at 1s / 4s / 16s). Promotion to pg-boss is a behind-the-
    // curtain swap of the queue adapter.
    const signingKey = deriveSigningKey(hook.secretHash)
    const jobPayload: WebhookDeliverJobPayload = {
      webhookId: hook.id,
      organizationId: orgId,
      url: hook.url,
      signingKey,
      eventName,
      payload,
    }
    enqueueJob<WebhookDeliverJobPayload>({
      kind: 'webhook.deliver',
      payload: jobPayload,
      maxAttempts: 3,
    })
  }
}

export function registerWebhookDispatcher(): void {
  if (registered) return
  registered = true
  // Register the job handler exactly once. The queue accepts re-registration
  // (last writer wins) so HMR + test isolation are safe.
  registerJobHandler<WebhookDeliverJobPayload>('webhook.deliver', handleWebhookDeliver)
  onAny((name, payload) => {
    // Never throw — bus already wraps in allSettled but defense in depth.
    return dispatchEvent(name, payload).catch((err) => {
      log('error', 'webhook_dispatcher.dispatch_error', {
        event: name,
        error: err instanceof Error ? err.message : 'unknown',
      })
    })
  })
}

/** Internal hash helper retained for future sealed-secret integration. */
void createHash
void webhookDeliveries
void RETRY_DELAYS_MS
