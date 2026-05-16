/**
 * shared/mocks/webhook.mock.ts — MockWebhookService (W2-4 / EH-H Part B / ADR-0022).
 *
 * # Decisions (ADR-0008, ADR-0022)
 *   - Mocks DO NOT POST anywhere. `test()` synthesises a "ping"
 *     delivery row marked successful so the page UX renders.
 *   - Secret returned on create as `whsec_<hex>`; sha256(secret) stored
 *     in `secretHash` to mirror the real path.
 */
import {
  WEBHOOK_SECRET_PREFIX,
  type IWebhookService,
  type Webhook,
  type WebhookCreateInput,
  type WebhookCreateOutput,
  type WebhookDelivery,
  type WebhookUpdateInput,
} from '../contracts/webhook'
import { assertSameTenant, type TenantResolver } from './tenant'

interface WebhookInternal extends Webhook {
  secretHash: string
}

const rows: WebhookInternal[] = []
const deliveries: WebhookDelivery[] = []

function randomHex(byteLen: number): string {
  const arr = new Uint8Array(byteLen)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toExternal(r: WebhookInternal): Webhook {
  // strip secretHash from the external view
  const { secretHash: _omit, ...rest } = r
  void _omit
  return rest
}

export class MockWebhookService implements IWebhookService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: Webhook[] }> {
    assertSameTenant(this.resolver, organizationId)
    return {
      rows: rows
        .filter((r) => r.organizationId === organizationId && r.deletedAt === null)
        .map(toExternal),
    }
  }

  async get(id: string, organizationId: string): Promise<Webhook | null> {
    assertSameTenant(this.resolver, organizationId)
    const r = rows.find(
      (x) => x.id === id && x.organizationId === organizationId && x.deletedAt === null,
    )
    return r ? toExternal(r) : null
  }

  async create(input: WebhookCreateInput): Promise<WebhookCreateOutput> {
    assertSameTenant(this.resolver, input.organizationId)
    const raw = WEBHOOK_SECRET_PREFIX + randomHex(24)
    const secretHash = await sha256Hex(raw)
    const now = new Date().toISOString()
    const r: WebhookInternal = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      url: input.url,
      eventTypes: [...input.eventTypes],
      secretHash,
      secretPrefix: raw.slice(0, 12),
      isActive: true,
      failureCount: 0,
      lastDeliveryAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(r)
    return { row: toExternal(r), secret: raw }
  }

  async update(input: WebhookUpdateInput): Promise<Webhook> {
    assertSameTenant(this.resolver, input.organizationId)
    const r = rows.find(
      (x) => x.id === input.id && x.organizationId === input.organizationId && x.deletedAt === null,
    )
    if (!r) throw new Error('Webhook not found')
    if (input.name !== undefined) r.name = input.name
    if (input.url !== undefined) r.url = input.url
    if (input.eventTypes !== undefined) r.eventTypes = [...input.eventTypes]
    if (input.isActive !== undefined) r.isActive = input.isActive
    r.updatedAt = new Date().toISOString()
    return toExternal(r)
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    const r = rows.find((x) => x.id === id && x.organizationId === organizationId)
    if (!r) return
    r.deletedAt = new Date().toISOString()
    r.updatedAt = r.deletedAt
  }

  async test(id: string, organizationId: string): Promise<WebhookDelivery> {
    assertSameTenant(this.resolver, organizationId)
    const r = rows.find(
      (x) => x.id === id && x.organizationId === organizationId && x.deletedAt === null,
    )
    if (!r) throw new Error('Webhook not found')
    const now = new Date().toISOString()
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      organizationId,
      webhookId: id,
      eventType: 'ping',
      payload: { ping: true, timestamp: now },
      responseStatus: 200,
      responseBody: 'mock-ok',
      attempt: 1,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    deliveries.unshift(delivery)
    r.lastDeliveryAt = now
    r.failureCount = 0
    r.updatedAt = now
    return delivery
  }

  async deliveries(id: string, organizationId: string, limit = 10): Promise<WebhookDelivery[]> {
    assertSameTenant(this.resolver, organizationId)
    return deliveries
      .filter((d) => d.webhookId === id && d.organizationId === organizationId)
      .slice(0, limit)
  }
}

export function __resetMockWebhooksForTests(): void {
  rows.length = 0
  deliveries.length = 0
}
