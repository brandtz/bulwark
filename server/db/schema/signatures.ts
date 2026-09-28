/**
 * server/db/schema/signatures.ts — immutable e-signature attestations
 * (WP-X2, ED-00D).
 *
 * In-house typed/drawn signature: signer name, consent checkbox, IP, user agent,
 * timestamp and a hash of the exact document signed. Referenced by
 * inspections, quotes, change orders and deliverables via (entity_type,
 * entity_id). Append-only: the service exposes no update or delete, and the
 * table has no updated_at / deleted_at columns to suggest otherwise.
 */
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { orgColumn } from './_shared'

export const signatures = pgTable(
  'signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    /** inspection | quote | change_order | deliverable */
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    signerName: text('signer_name').notNull(),
    signerEmail: text('signer_email'),
    signerUserId: uuid('signer_user_id'),
    /** typed | drawn */
    method: text('method').notNull(),
    /** Storage key of the drawn image (null for typed). */
    imageKey: text('image_key'),
    consent: boolean('consent').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** sha256 hex of the document content the signer saw. */
    documentHash: text('document_hash').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEntity: index('signatures_org_entity_idx').on(t.organizationId, t.entityType, t.entityId),
  }),
)

export type SignatureRow = typeof signatures.$inferSelect
