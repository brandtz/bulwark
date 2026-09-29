/**
 * server/services/_providers/push.ts — Web Push sender (WP-X3, ED-016).
 *
 * VAPID (RFC 8292) with node:crypto only: an ES256 JWT signed by the
 * VAPID_PRIVATE_KEY, sent as `Authorization: vapid t=<jwt>, k=<public key>`.
 * Pushes carry no payload (see shared/contracts/push.ts), so no RFC 8291
 * encryption is required. 404/410 from the push service = subscription gone →
 * revoked so later sends skip it.
 *
 * Keys are the standard base64url pair (65-byte uncompressed P-256 public key,
 * 32-byte private scalar), e.g. from `npx web-push generate-vapid-keys`.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { pushSubscriptions } from '../../db/schema/push_subscriptions'
import { log } from '../../utils/logger'
import { isAllowedPushEndpoint, type PushSendResult } from '../../../shared/contracts/push'

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export function vapidConfig(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || 'mailto:support@bulwark.app' }
}

const b64url = (buf: Buffer) => buf.toString('base64url')

/** ES256 VAPID JWT for one push-service origin. Exported for tests. */
export function buildVapidJwt(audience: string, cfg: VapidConfig, now = Date.now()): string {
  const pub = Buffer.from(cfg.publicKey, 'base64url')
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be a 65-byte uncompressed P-256 point')
  const key = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)), d: cfg.privateKey },
  })
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: cfg.subject })))
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `${header}.${claims}.${b64url(signature)}`
}

type Fetcher = (url: string, init: { method: string, headers: Record<string, string>, signal?: AbortSignal }) => Promise<{ status: number }>

/** Payload-less push to one endpoint. Returns the push service's status. */
export async function sendPush(endpoint: string, cfg: VapidConfig, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<number> {
  // Re-checked at send time: rows stored before the allowlist existed must not
  // turn into server-side requests to arbitrary hosts.
  if (!isAllowedPushEndpoint(endpoint)) throw new Error('push endpoint is not on an allowed push service')
  const jwt = buildVapidJwt(new URL(endpoint).origin, cfg)
  const res = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'ttl': '86400', 'urgency': 'normal', 'content-length': '0', 'authorization': `vapid t=${jwt}, k=${cfg.publicKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  return res.status
}

/** Push to every live device of one user. Never throws (a push failure must not break notification fan-out). */
export async function sendPushToUser(organizationId: string, userId: string, fetcher?: Fetcher): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, revoked: 0, failed: 0 }
  const cfg = vapidConfig()
  if (!cfg) return result
  const db = getDb()
  const subs = await db.select().from(pushSubscriptions).where(and(
    eq(pushSubscriptions.organizationId, organizationId),
    eq(pushSubscriptions.userId, userId),
    isNull(pushSubscriptions.revokedAt),
  ))
  for (const s of subs) {
    try {
      const status = await sendPush(s.endpoint, cfg, fetcher)
      if (status === 404 || status === 410) {
        await db.update(pushSubscriptions).set({ revokedAt: new Date() }).where(eq(pushSubscriptions.id, s.id))
        result.revoked++
      } else if (status >= 200 && status < 300) {
        result.sent++
      } else {
        result.failed++
        log('warn', 'push.send_failed', { status, subscriptionId: s.id })
      }
    } catch (err) {
      result.failed++
      log('warn', 'push.send_failed', { subscriptionId: s.id, message: err instanceof Error ? err.message : 'unknown' })
    }
  }
  return result
}
