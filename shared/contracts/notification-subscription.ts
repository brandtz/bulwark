/**
 * shared/contracts/notification-subscription.ts — per-user notification
 * preferences (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008)
 *   - One row per `(org, user, eventType)`. `channels` is a typed
 *     `{ inApp, email, sms }` triple. The page renders a matrix:
 *     events on rows, three column checkboxes per row.
 *   - **Defaults seeded on user creation.** `NOTIFICATION_DEFAULTS`
 *     codifies the rule: inApp=true for everything; email=true for
 *     `invoiceMarkedPaid`, `quoteAccepted`, `complianceDocReady`,
 *     `userInvited`; sms=false everywhere in Phase 1.
 *   - **`KNOWN_EVENT_TYPES`** is the list of slugs surfaced in the
 *     matrix. Sourced from `shared/events/catalog.ts` event names.
 *     Kept here (not auto-derived) because the matrix wants stable
 *     ordering + human labels that aren't on the event handle.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Channels.
// ----------------------------------------------------------------------------
export const NotificationChannelsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
})
export type NotificationChannels = z.infer<typeof NotificationChannelsSchema>

// ----------------------------------------------------------------------------
// Row + inputs.
// ----------------------------------------------------------------------------
export const NotificationSubscriptionSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    userId: UuidSchema,
    eventType: z.string().min(1).max(120),
    channels: NotificationChannelsSchema,
  })
  .merge(AuditFieldsSchema)
export type NotificationSubscription = z.infer<typeof NotificationSubscriptionSchema>

export const NotificationSubscriptionUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema,
  eventType: z.string().min(1).max(120),
  channels: NotificationChannelsSchema,
})
export type NotificationSubscriptionUpsertInput = z.infer<
  typeof NotificationSubscriptionUpsertInputSchema
>

export const NotificationSubscriptionBulkInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema,
  entries: z
    .array(
      z.object({
        eventType: z.string().min(1).max(120),
        channels: NotificationChannelsSchema,
      }),
    )
    .max(200),
})
export type NotificationSubscriptionBulkInput = z.infer<
  typeof NotificationSubscriptionBulkInputSchema
>

// ----------------------------------------------------------------------------
// Catalog of known event types (matrix rows) + defaults.
// ----------------------------------------------------------------------------
export interface KnownEventDescriptor {
  eventType: string
  label: string
  description: string
}
export const KNOWN_EVENT_TYPES: KnownEventDescriptor[] = [
  { eventType: 'property.created', label: 'Property created', description: 'A new property was added.' },
  { eventType: 'property.status_changed', label: 'Property status changed', description: 'A property moved to a new pipeline state.' },
  { eventType: 'assessment.signed', label: 'Assessment signed', description: 'A field assessment was signed off.' },
  { eventType: 'quote.sent', label: 'Quote sent', description: 'A quote was emailed to the homeowner.' },
  { eventType: 'quote.accepted', label: 'Quote accepted', description: 'The homeowner accepted a quote.' },
  { eventType: 'quote.rejected', label: 'Quote rejected', description: 'The homeowner rejected a quote.' },
  { eventType: 'work_order.created', label: 'Work order created', description: 'A new work order was scheduled.' },
  { eventType: 'work_order.completed', label: 'Work order completed', description: 'A work order finished.' },
  { eventType: 'compliance_doc.ready', label: 'Compliance doc ready', description: 'A compliance PDF is ready to send.' },
  { eventType: 'invoice.sent', label: 'Invoice sent', description: 'An invoice was sent to the homeowner.' },
  { eventType: 'invoice.marked_paid', label: 'Invoice marked paid', description: 'An invoice was marked paid.' },
  { eventType: 'invoice.overdue', label: 'Invoice overdue', description: 'An invoice crossed its due date.' },
  { eventType: 'user.invited', label: 'User invited', description: 'A teammate was invited to the org.' },
]

const EMAIL_ON_BY_DEFAULT = new Set<string>([
  'invoice.marked_paid',
  'quote.accepted',
  'compliance_doc.ready',
  'user.invited',
])

export function defaultChannelsFor(eventType: string): NotificationChannels {
  return {
    inApp: true,
    email: EMAIL_ON_BY_DEFAULT.has(eventType),
    sms: false,
  }
}

export const NOTIFICATION_DEFAULTS: Array<{
  eventType: string
  channels: NotificationChannels
}> = KNOWN_EVENT_TYPES.map((e) => ({
  eventType: e.eventType,
  channels: defaultChannelsFor(e.eventType),
}))

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface INotificationSubscriptionService {
  list(organizationId: string): Promise<{ rows: NotificationSubscription[] }>
  listForUser(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }>
  upsert(
    input: NotificationSubscriptionUpsertInput,
  ): Promise<NotificationSubscription>
  bulkUpsert(
    input: NotificationSubscriptionBulkInput,
  ): Promise<{ rows: NotificationSubscription[] }>
  resetToDefaults(
    organizationId: string,
    userId: string,
  ): Promise<{ rows: NotificationSubscription[] }>
}
