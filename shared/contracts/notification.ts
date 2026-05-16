/**
 * shared/contracts/notification.ts — in-app notification feed contract
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - One contract serves the bell badge, the dropdown list, and the
 *     `/notifications` feed page. The shape is intentionally tiny:
 *     `id, title, body, severity, relatedEntity, readAt, createdAt`.
 *     UI never needs the email/sms delivery state — that's audit-log
 *     territory.
 *   - `enqueue()` is the write surface used by the notification
 *     subscriber (`server/services/_subscribers/notification-
 *     subscriber.ts`). It is NOT exposed to end-user UI: there's no
 *     `composer` view, and arbitrary users can't push rows to other
 *     users.
 *   - `unreadCountForUser` is its own method (rather than reading
 *     `total` from a `listForUser({ unreadOnly: true })` call) so the
 *     30-second bell poll skips serializing rows it won't render.
 *
 * # Decisions cast down
 *   - Rejected: typing `severity` as a strict union literal at the
 *     row level. Drizzle stores it as `text`; keeping the row schema
 *     a `z.string()` would let stale rows from a future severity
 *     value still round-trip the contract. Instead we enum-strict the
 *     *input* (`enqueue.severity`) and broadly type the row output.
 *   - Rejected: a `markUnread` toggle. Mark-read is one-way by
 *     product design; if a user wants to revisit, they go to the
 *     feed page.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Severity.
// ----------------------------------------------------------------------------
export const NotificationSeveritySchema = z.enum(['info', 'success', 'warning', 'error'])
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>

// ----------------------------------------------------------------------------
// Row.
// ----------------------------------------------------------------------------
export const NotificationSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    userId: UuidSchema,
    eventType: z.string().min(1).max(120),
    title: z.string().min(1),
    body: z.string(),
    severity: NotificationSeveritySchema,
    relatedEntityType: z.string().nullable(),
    relatedEntityId: UuidSchema.nullable(),
    readAt: z.string().datetime().nullable(),
  })
  .merge(AuditFieldsSchema)
export type Notification = z.infer<typeof NotificationSchema>

// ----------------------------------------------------------------------------
// Inputs.
// ----------------------------------------------------------------------------
export const NotificationEnqueueInputSchema = z.object({
  organizationId: UuidSchema,
  userId: UuidSchema,
  eventType: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).default(''),
  severity: NotificationSeveritySchema.default('info'),
  relatedEntityType: z.string().max(60).nullable().optional(),
  relatedEntityId: UuidSchema.nullable().optional(),
})
export type NotificationEnqueueInput = z.infer<typeof NotificationEnqueueInputSchema>

export const NotificationListInputSchema = z.object({
  unreadOnly: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(200).default(50),
})
export type NotificationListInput = z.infer<typeof NotificationListInputSchema>

export const NotificationListOutputSchema = z.object({
  rows: z.array(NotificationSchema),
  total: z.number().int().nonnegative(),
  unreadTotal: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})
export type NotificationListOutput = z.infer<typeof NotificationListOutputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface INotificationService {
  listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; page?: number; pageSize?: number },
  ): Promise<NotificationListOutput>
  unreadCountForUser(userId: string): Promise<number>
  markRead(id: string): Promise<void>
  markAllRead(userId: string): Promise<void>
  /**
   * Write a row. Used by the notification subscriber only — UI never
   * calls this directly. Returns the created row id.
   */
  enqueue(input: NotificationEnqueueInput): Promise<{ id: string }>
}
