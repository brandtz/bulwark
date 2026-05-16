/**
 * server/plugins/event-subscribers.ts — Nitro plugin: wire domain event
 * subscribers at process boot (W1-4 / EH-D / ADR-0017).
 *
 * # Decisions (ADR-0008, ADR-0017)
 *   - Nitro plugins under `server/plugins/` auto-load once per server
 *     process. This is the registration call site referenced by EH-D
 *     deliverable #5. Re-entering (HMR, test isolation) is safe — the
 *     subscriber file guards with an internal `registered` flag.
 *   - We deliberately do not pass any per-request context here. The
 *     subscribers read from the event payloads, which already carry
 *     `organizationId` + `actorUserId`. There is no ambient "current
 *     request" at plugin-init time; that's correct.
 */
import { registerPropertyStatusSubscribers } from '../services/_subscribers/property-status'
import { registerWebhookDispatcher } from '../services/_subscribers/webhook-dispatcher'
import { registerNotificationSubscriber } from '../services/_subscribers/notification-subscriber'

export default defineNitroPlugin(() => {
  registerPropertyStatusSubscribers()
  registerWebhookDispatcher()
  registerNotificationSubscriber()
})
