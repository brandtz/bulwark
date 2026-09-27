import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { orgColumn } from './_shared'

export const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    channel: text('channel').notNull(),
    provider: text('provider').notNull(),
    recipientHash: text('recipient_hash').notNull(),
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    eventType: text('event_type'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: uuid('related_entity_id'),
    attempt: integer('attempt').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationCreatedIdx: index('message_deliveries_org_created_idx').on(table.organizationId, table.createdAt),
    statusCreatedIdx: index('message_deliveries_status_created_idx').on(table.status, table.createdAt),
  }),
)

export type MessageDelivery = typeof messageDeliveries.$inferSelect
export type NewMessageDelivery = typeof messageDeliveries.$inferInsert