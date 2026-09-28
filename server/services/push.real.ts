/**
 * server/services/push.real.ts — RealPushService (WP-X3, ED-016).
 * Every method is self-scoped: the caller manages only their own devices.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { pushSubscriptions } from '../db/schema/push_subscriptions'
import {
  PushSubscribeInputSchema,
  type IPushService,
  type PushConfig,
  type PushDevice,
  type PushSendResult,
  type PushSubscribeInput,
} from '../../shared/contracts/push'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { sendPushToUser, vapidConfig } from './_providers/push'

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
    // The endpoint is globally unique: re-subscribing (or a device changing
    // hands) rebinds it to the current user and un-revokes it.
    const [row] = await getDb()
      .insert(pushSubscriptions)
      .values({ organizationId: v.organizationId, userId, endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent ?? null })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { organizationId: v.organizationId, userId, p256dh: v.keys.p256dh, auth: v.keys.auth, userAgent: v.userAgent ?? null, lastSeenAt: new Date(), revokedAt: null },
      })
      .returning()
    return toDevice(row!)
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
    return sendPushToUser(organizationId, this.caller(organizationId))
  }
}
