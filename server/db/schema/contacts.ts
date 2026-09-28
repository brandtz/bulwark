/**
 * server/db/schema/contacts.ts — additional people attached to a property OR client (W2-1 / EH-E).
 *
 * # Decisions (ADR-0008, ADR-0018)
 *   - A `client` row models a single homeowner; in practice a job touches
 *     multiple humans: owner, tenant, property manager, HOA contact,
 *     emergency contact, insurance adjuster, vendor reps. This table
 *     stores that wider rolodex.
 *   - Either `propertyId` OR `clientId` (or both) may be set. Database
 *     does not enforce the "at least one" rule — the service layer does,
 *     so we can later allow contacts attached only at the organization
 *     level (e.g. a permit office) without a migration.
 *   - `isPrimary` flags the row the UI should hoist as the default
 *     contact card. The service enforces "at most one primary per
 *     property" by demoting siblings on `setPrimary()` — keeping the
 *     uniqueness as a service invariant lets us extend "primary"
 *     semantics later (per kind, per client) without DB changes.
 */
import { pgTable, text, uuid, integer, boolean, index } from 'drizzle-orm/pg-core'
import { auditColumns, orgColumn } from './_shared'
import { people } from './people'

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,

    // Either propertyId OR clientId required — enforced at service layer
    // (see contact.real.ts / contact.mock.ts).
    propertyId: uuid('property_id'),
    clientId: uuid('client_id'),

    // 'owner' | 'tenant' | 'property_manager' | 'hoa' | 'emergency' | 'insurance' | 'vendor' | 'other'
    kind: text('kind').notNull().default('other'),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),

    isPrimary: boolean('is_primary').notNull().default(false),
    // WP-X2 / ED-036: contacts become the join to `people`. person_id is backfilled
    // by 0021 (dedupe by email); name/email/phone stay as a denormalized copy
    // until every reader moves to the person.
    personId: uuid('person_id').references(() => people.id),
    isBilling: boolean('is_billing').notNull().default(false),

    sortOrder: integer('sort_order').notNull().default(0),

    ...auditColumns,
  },
  (t) => ({
    // WP-L06 S5: org-scoped list / lookup indexes (docs/DATA_LAYER.md).
    orgProperty: index('contacts_org_property_idx').on(t.organizationId, t.propertyId),
  }),
)

export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert
