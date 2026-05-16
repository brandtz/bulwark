/**
 * server/db/schema/webhooks.ts — outbound webhook subscriptions
 * (Wave 2 / EH-H Part B / W2-4 / ADR-0022).
 *
 * # Decisions (ADR-0008, ADR-0022)
 *   - One row per outbound webhook subscription. `eventTypes` JSONB
 *     array holds the W1-4 event slugs this webhook listens for. The
 *     dispatcher subscriber iterates org webhooks on every emit and
 *     POSTs to those that match.
 *   - `secretHash` stores sha256 of the signing secret. The raw secret
 *     is returned to the admin ONCE on create + on rotate (similar to
 *     api_keys pattern). HMAC-SHA256 signing uses the raw secret;
 *     verification by the receiver uses the same value they copied.
 *   - `failureCount` is a coarse health signal — incremented on every
 *     failed delivery, zeroed on success. UI surfaces a warning chip
 *     when ≥ 3.
 */
import { pgTable, text, uuid, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  name: text('name').notNull(),
  url: text('url').notNull(),
  eventTypes: jsonb('event_types').$type<string[]>().notNull().default([]),
  /** sha256 hex of the raw signing secret. */
  secretHash: text('secret_hash').notNull(),
  /** First 8 chars of raw secret for UI display ("whsec_abc12345…"). */
  secretPrefix: text('secret_prefix').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  failureCount: integer('failure_count').notNull().default(0),
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  ...auditColumns,
})

export type WebhookRow = typeof webhooks.$inferSelect
export type NewWebhookRow = typeof webhooks.$inferInsert

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...orgColumn,
  webhookId: uuid('webhook_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  attempt: integer('attempt').notNull().default(1),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  ...auditColumns,
})

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert
