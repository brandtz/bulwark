/**
 * shared/contracts/push.ts — Web Push as the 4th notification channel
 * (WP-X3, ED-016).
 *
 * # Decisions
 *   - **Standard Web Push + VAPID**, no third-party service. Keys come from
 *     VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT; without them push is
 *     disabled (`config().enabled === false`) and the channel stays hidden
 *     (ED-016 progressive disclosure).
 *   - **Payload-less pushes.** The service worker shows a generic "new
 *     notification" and opens /notifications, where the signed-in page reads
 *     the real content. Nothing sensitive transits the push service, and no
 *     payload encryption (RFC 8291) is needed for this scaffold.
 *   - **Self-scoped.** Every method acts on the caller's own devices.
 *   - Subscriptions answered 404/410 by the push service are revoked on send.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const PushConfigSchema = z.object({
  enabled: z.boolean(),
  /** Base64url VAPID public key for PushManager.subscribe(applicationServerKey). */
  vapidPublicKey: z.string().nullable(),
})
export type PushConfig = z.infer<typeof PushConfigSchema>

/**
 * Browser push services we will POST to. The server sends to the subscription
 * endpoint, so an open URL would be an SSRF primitive (internal hosts, cloud
 * metadata); only these hosts, over https on the default port, are accepted.
 */
export const PUSH_SERVICE_HOSTS: ReadonlyArray<{ host: string, subdomains: boolean }> = [
  { host: 'fcm.googleapis.com', subdomains: false },
  { host: 'push.services.mozilla.com', subdomains: true },
  { host: 'notify.windows.com', subdomains: true },
  { host: 'web.push.apple.com', subdomains: false },
  { host: 'push.apple.com', subdomains: true },
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443')) return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOSTS.some((h) => host === h.host || (h.subdomains && host.endsWith(`.${h.host}`)))
}

/** Live devices one user may register; beyond this, subscribe is refused. */
export const PUSH_MAX_DEVICES_PER_USER = 10

export const PushSubscribeInputSchema = z.object({
  organizationId: UuidSchema,
  endpoint: z.string().url().max(2000).refine(isAllowedPushEndpoint, 'Push endpoints must be an https URL on a known browser push service'),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  userAgent: z.string().max(300).optional(),
})
export type PushSubscribeInput = z.infer<typeof PushSubscribeInputSchema>

export const PushDeviceSchema = z.object({
  id: UuidSchema,
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
})
export type PushDevice = z.infer<typeof PushDeviceSchema>

export const PushSendResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  revoked: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})
export type PushSendResult = z.infer<typeof PushSendResultSchema>

export interface IPushService {
  config(organizationId: string): Promise<PushConfig>
  subscribe(input: PushSubscribeInput): Promise<PushDevice>
  unsubscribe(input: { organizationId: string, endpoint: string }): Promise<void>
  listMine(organizationId: string): Promise<PushDevice[]>
  /** Send a test push to the caller's own devices. */
  sendTest(organizationId: string): Promise<PushSendResult>
}
