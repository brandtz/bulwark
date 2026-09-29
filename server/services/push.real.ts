/**
 * server/services/push.real.ts — RealPushService (WP-X3, ED-016).
 * Every method is self-scoped: the caller manages only their own devices.
 */
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pushSubscriptions } from '../db/schema/push_subscriptions'
import {
  PUSH_MAX_DEVICES_PER_USER,
  PushSubscribeInputSchema,
  type IPushService,
  type PushConfig,
  type PushDevice,
  type PushSendResult,
  type PushSubscribeInput,
} from '../../shared/contracts/push'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { sendPushToUser, vapidConfig } from './_providers/push'

/** One test push per user per window; each send can hold a request ~10s per device. */
const SEND_TEST_COOLDOWN_MS = 30_000
const lastTestAt = new Map<string, number>()

type Row = typeof pushSubscriptions.$inferSelect
const toDevice = (r: Row): PushDevice => ({
  id: r.id,
  userAgent: r.userAgent,
  createdAt: r.createdAt.toISOString(),
  lastSeenAt: r.lastSeenAt.toISOString(),
})

export class RealPushService implements IPushService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private caller(organizationId: string): string {
    assertSameTenant(this.tenantResolver, organizationId)
    const userId = this.tenantResolver?.()?.userId
    if (!userId || userId === 'system') throw new Error('Push requires a signed-in user')
    return userId
  }

  async config(organizationId: string): Promise<PushConfig> {
    assertSameTenant(this.tenantResolver, organizationId)
    const cfg = vapidConfig()
    return { enabled: !!cfg, vapidPublicKey: cfg?.publicKey ?? null }
  }

  async subscribe(input: PushSubscribeInput): Promise<PushDevice> {
    const parsed = PushSubscribeInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid push subscription: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const v = parsed.data
    const userId = this.caller(v.organizationId)
    if (!vapidConfig()) throw new Error('Invalid push subscription: push is not enabled')
    const db = getDb()
    const live = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)))
    if (live.length >= PUSH_MAX_DEVICES_PER_USER && !live.some((r) => r.endpoint === v.endpoint)) {
      throw new Error(`Invalid push subscription: at most ${PUSH_MAX_DEVICES_PER_USER} devices per user`)
    }
    // The endpoint is globally unique. Re-subscribing refreshes the caller's own
    // row; a revoked row may be claimed by anyone (the browser handed it out
    // again), but a live row belonging to another user is never rebound.
    const [row] = await db
      .insert(pushSubscriptions)
      .values({ organizationId: v.organizationId, userId, endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent ?? null })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { organizationId: v.organizationId, userId, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent ?? null, lastSeenAt: new Date(), revokedAt: null },
        setWhere: or(eq(pushSubscriptions.userId, userId), isNotNull(pushSubscriptions.revokedAt)),
      })
      .returning()
    if (!row) throw new Error('Invalid push subscription: endpoint is registered to another account')
    return toDevice(row)
  }

  async unsubscribe(input: { organizationId: string, endpoint: string }): Promise<void> {
    const userId = this.caller(input.organizationId)
    await getDb()
      .update(pushSubscriptions)
      .set({ revokedAt: new Date() })
      .where(and(eq(pushSubscriptions.endpoint, input.endpoint), eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)))
  }

  async listMine(organizationId: string): Promise<PushDevice[]> {
    const userId = this.caller(organizationId)
    const rows = await getDb().select().from(pushSubscriptions).where(and(
      eq(pushSubscriptions.organizationId, organizationId),
      eq(pushSubscriptions.userId, userId),
      isNull(pushSubscriptions.revokedAt),
    ))
    return rows.map(toDevice)
  }

  async sendTest(organizationId: string): Promise<PushSendResult> {
    const userId = this.caller(organizationId)
    const now = Date.now()
    const last = lastTestAt.get(userId) ?? 0
    if (now - last < SEND_TEST_COOLDOWN_MS) throw new Error('Invalid request: wait a moment before sending another test push')
    lastTestAt.set(userId, now)
    return sendPushToUser(organizationId, userId)
  }
}
