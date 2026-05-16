/**
 * server/services/webhook.real.ts — RealWebhookService
 * (W2-4 / EH-H Part B / ADR-0022).
 *
 * # Decisions (ADR-0008, ADR-0022)
 *   - Issue-once secret: `create()` mints a `whsec_<48 hex>` secret,
 *     stores sha256 hex of it + a 12-char prefix for UI, and returns
 *     the raw value ONCE.
 *   - `test()` dispatches a synthetic `webhook.ping` event to JUST this
 *     webhook — bypassing the global subscriber's "match by eventType"
 *     filter — so admins can probe a brand-new endpoint without
 *     wiring an event listener up first.
 *   - Soft delete via `deletedAt`. Keeps delivery history intact.
 */
import { randomBytes, createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type {
  IWebhookService,
  Webhook,
  WebhookCreateInput,
  WebhookCreateOutput,
  WebhookDelivery,
  WebhookUpdateInput,
} from '../../shared/contracts/webhook'
import { WEBHOOK_SECRET_PREFIX } from '../../shared/contracts/webhook'
import { signWebhookPayload } from '../../shared/utils/webhook-signature'
import { webhooks, webhookDeliveries } from '../db/schema/webhooks'
import type { WebhookRow, WebhookDeliveryRow } from '../db/schema/webhooks'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: WebhookRow): Webhook {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    url: r.url,
    eventTypes: r.eventTypes ?? [],
    secretPrefix: r.secretPrefix,
    isActive: r.isActive,
    failureCount: r.failureCount,
    lastDeliveryAt: r.lastDeliveryAt ? r.lastDeliveryAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function deliveryToContract(r: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: r.id,
    organizationId: r.organizationId,
    webhookId: r.webhookId,
    eventType: r.eventType,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    responseStatus: r.responseStatus,
    responseBody: r.responseBody,
    attempt: r.attempt,
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function mintSecret(): { raw: string; hash: string; prefix: string } {
  const raw = WEBHOOK_SECRET_PREFIX + randomBytes(24).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 12)
  return { raw, hash, prefix }
}

export class RealWebhookService implements IWebhookService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: Webhook[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.organizationId, organizationId))
      .orderBy(desc(webhooks.createdAt))
    return { rows: rows.filter((r) => !r.deletedAt).map(rowToContract) }
  }

  async get(id: string, organizationId: string): Promise<Webhook | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)))
      .limit(1)
    return row && !row.deletedAt ? rowToContract(row) : null
  }

  async create(input: WebhookCreateInput): Promise<WebhookCreateOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const { raw, hash, prefix } = mintSecret()
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(webhooks)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          url: input.url,
          eventTypes: input.eventTypes,
          secretHash: hash,
          secretPrefix: prefix,
          isActive: true,
          failureCount: 0,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'webhook',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { name: input.name, url: input.url, eventTypes: input.eventTypes },
      })
      return { row: rowToContract(row!), secret: raw }
    })
  }

  async update(input: WebhookUpdateInput): Promise<Webhook> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, input.id), eq(webhooks.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Webhook not found')

      const patch: Partial<typeof webhooks.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.url !== undefined) patch.url = input.url
      if (input.eventTypes !== undefined) patch.eventTypes = input.eventTypes
      if (input.isActive !== undefined) patch.isActive = input.isActive

      const [row] = await tx
        .update(webhooks)
        .set(patch)
        .where(eq(webhooks.id, input.id))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'webhook',
        entityId: input.id,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        before: {
          name: before.name,
          url: before.url,
          eventTypes: before.eventTypes,
          isActive: before.isActive,
        },
        after: patch,
      })
      return rowToContract(row!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      await tx
        .update(webhooks)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'webhook',
        entityId: id,
        action: 'delete',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
      })
    })
  }

  async test(id: string, organizationId: string): Promise<WebhookDelivery> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [hook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)))
      .limit(1)
    if (!hook) throw new Error('Webhook not found')

    const payload = {
      eventType: 'webhook.ping',
      organizationId,
      timestamp: new Date().toISOString(),
      message: 'Bulwark webhook test ping.',
    }
    const body = JSON.stringify(payload)
    const sig = signWebhookPayload(body, hook.secretHash)
    // NOTE: secretHash is the stored hash, not the raw secret — for
    // the `test()` smoke we sign with the hash so the receiver can at
    // least verify the *header shape*. The real dispatcher signs with
    // the raw secret which only the admin holds.
    let status: number | null = null
    let responseBody: string | null = null
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [sig.header]: sig.value,
        },
        body,
      })
      status = res.status
      responseBody = (await res.text()).slice(0, 1000)
    } catch (err) {
      responseBody = (err as Error).message
    }
    const [row] = await db
      .insert(webhookDeliveries)
      .values({
        organizationId,
        webhookId: id,
        eventType: 'webhook.ping',
        payload,
        responseStatus: status,
        responseBody,
        attempt: 1,
        deliveredAt: new Date(),
      })
      .returning()
    return deliveryToContract(row!)
  }

  async deliveries(
    id: string,
    organizationId: string,
    limit = 50,
  ): Promise<WebhookDelivery[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.webhookId, id),
          eq(webhookDeliveries.organizationId, organizationId),
        ),
      )
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit)
    return rows.map(deliveryToContract)
  }
}
