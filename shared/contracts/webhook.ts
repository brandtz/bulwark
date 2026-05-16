/**
 * shared/contracts/webhook.ts — outbound webhook subscriptions
 * (W2-4 / EH-H Part B / ADR-0022).
 *
 * # Decisions (ADR-0008, ADR-0022)
 *   - **Issue-once secret**, mirroring `api-key`. `create()` returns
 *     the raw signing secret in the result; the DB stores sha256 hex.
 *     `secretPrefix` (first 12 chars including `whsec_`) shows in the
 *     row list.
 *   - **HMAC-SHA256 signing.** Delivery sends
 *     `X-Bulwark-Signature: hmac-sha256=<hexsig>` over the raw JSON
 *     body. Receivers verify with the secret they copied. Algorithm
 *     and header name are part of the contract surface (admins build
 *     verifiers against them).
 *   - **`eventTypes` is JSONB array of event slugs** from
 *     `shared/events/catalog.ts`. The contract doesn't pin the enum
 *     (the catalog grows per epic); admins choose from a multi-select
 *     populated at the page layer. An empty array means "no events"
 *     — effectively disabled.
 *   - **`test()` fires a `ping` event** (synthetic) and records the
 *     delivery attempt the same way real events do.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

export const WEBHOOK_SECRET_PREFIX = 'whsec_'
export const WEBHOOK_SIGNATURE_HEADER = 'X-Bulwark-Signature'
export const WEBHOOK_SIGNATURE_ALGORITHM = 'hmac-sha256'

// ----------------------------------------------------------------------------
// Row.
// ----------------------------------------------------------------------------
export const WebhookSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    name: z.string().min(1).max(120),
    url: z.string().url(),
    eventTypes: z.array(z.string().min(1).max(120)),
    secretPrefix: z.string(),
    isActive: z.boolean(),
    failureCount: z.number().int().nonnegative(),
    lastDeliveryAt: z.string().datetime().nullable(),
  })
  .merge(AuditFieldsSchema)
export type Webhook = z.infer<typeof WebhookSchema>

export const WebhookDeliverySchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    webhookId: UuidSchema,
    eventType: z.string().min(1).max(120),
    payload: z.record(z.unknown()),
    responseStatus: z.number().int().nullable(),
    responseBody: z.string().nullable(),
    attempt: z.number().int().positive(),
    deliveredAt: z.string().datetime().nullable(),
  })
  .merge(AuditFieldsSchema)
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const WebhookCreateInputSchema = z.object({
  organizationId: UuidSchema,
  name: z.string().min(1).max(120),
  url: z.string().url(),
  eventTypes: z.array(z.string().min(1).max(120)).min(0).max(50),
})
export type WebhookCreateInput = z.infer<typeof WebhookCreateInputSchema>

export const WebhookUpdateInputSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
  eventTypes: z.array(z.string().min(1).max(120)).max(50).optional(),
  isActive: z.boolean().optional(),
})
export type WebhookUpdateInput = z.infer<typeof WebhookUpdateInputSchema>

export const WebhookCreateOutputSchema = z.object({
  row: WebhookSchema,
  secret: z.string(),
})
export type WebhookCreateOutput = z.infer<typeof WebhookCreateOutputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IWebhookService {
  list(organizationId: string): Promise<{ rows: Webhook[] }>
  get(id: string, organizationId: string): Promise<Webhook | null>
  create(input: WebhookCreateInput): Promise<WebhookCreateOutput>
  update(input: WebhookUpdateInput): Promise<Webhook>
  softDelete(id: string, organizationId: string): Promise<void>
  /** Fire a synthetic `ping` event to this webhook only. */
  test(id: string, organizationId: string): Promise<WebhookDelivery>
  /** Last `limit` delivery attempts (newest first). */
  deliveries(id: string, organizationId: string, limit?: number): Promise<WebhookDelivery[]>
}

// ----------------------------------------------------------------------------
// HMAC signing helper (shared by service + subscriber + tests).
// ----------------------------------------------------------------------------
/**
 * Compute the canonical signature header value for `body` and `secret`.
 * Receivers verify the exact same string. We deliberately keep this
 * pure-data (no Node `crypto`) for the contract; the implementation
 * is in `shared/utils/webhook-signature.ts`.
 */
export interface WebhookSignaturePieces {
  header: typeof WEBHOOK_SIGNATURE_HEADER
  algorithm: typeof WEBHOOK_SIGNATURE_ALGORITHM
  /** `${algorithm}=<hex>`. */
  value: string
}
