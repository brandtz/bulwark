/**
 * shared/events/catalog.ts — typed catalog of Bulwark domain events
 * (W1-4 / EH-D / ADR-0017).
 *
 * # Decisions (ADR-0008, ADR-0017)
 *   - One file per domain entity? Rejected. Catalog stays flat so a
 *     grep finds every event name in one place. Adding an event is a
 *     two-line change here (export + payload).
 *   - Every payload carries `organizationId`, `entityId`, `actorUserId`
 *     (nullable), `timestamp` (ISO). Event-specific fields tack on as
 *     extra properties.
 *   - Event names are dot-separated `noun.verb_past_tense` (matches
 *     Pivot P4 catalog in the hardening plan).
 */
import { defineEvent } from './bus'

/** Fields every domain-event payload shares. */
export interface DomainEventBase {
  organizationId: string
  entityId: string
  actorUserId: string | null
  timestamp: string
}

// ---------------------------------------------------------------------------
// Property lifecycle.
// ---------------------------------------------------------------------------
export interface PropertyCreatedPayload extends DomainEventBase {
  addressLine1: string
}
export const propertyCreated = defineEvent<PropertyCreatedPayload>('property.created')

export interface PropertyStatusChangedPayload extends DomainEventBase {
  from: string
  to: string
  /** Event name that triggered the auto-transition, if any. */
  triggerEvent?: string
}
export const propertyStatusChanged = defineEvent<PropertyStatusChangedPayload>(
  'property.status_changed',
)

// ---------------------------------------------------------------------------
// Assessment.
// ---------------------------------------------------------------------------
export interface AssessmentSignedPayload extends DomainEventBase {
  propertyId: string
}
export const assessmentSigned = defineEvent<AssessmentSignedPayload>('assessment.signed')

// ---------------------------------------------------------------------------
// Quote lifecycle.
// ---------------------------------------------------------------------------
interface QuoteEventPayload extends DomainEventBase {
  propertyId: string
  quoteNumber: string
}
export const quoteSent = defineEvent<QuoteEventPayload>('quote.sent')
export const quoteAccepted = defineEvent<QuoteEventPayload>('quote.accepted')
export const quoteRejected = defineEvent<QuoteEventPayload & { reason?: string; reasonCode?: string }>('quote.rejected')
export const quoteExpired = defineEvent<QuoteEventPayload>('quote.expired')
/** W2-3 / EH-G: a new revision was forked from a prior quote. */
export const quoteRevised = defineEvent<
  QuoteEventPayload & { parentQuoteId: string; revisionNumber: number }
>('quote.revised')

// ---------------------------------------------------------------------------
// Work order lifecycle.
// ---------------------------------------------------------------------------
interface WorkOrderEventPayload extends DomainEventBase {
  propertyId: string
  workOrderNumber: string
}
export const workOrderCreated = defineEvent<WorkOrderEventPayload>('work_order.created')
export const workOrderStarted = defineEvent<WorkOrderEventPayload>('work_order.started')
export const workOrderCompleted = defineEvent<WorkOrderEventPayload>('work_order.completed')
/** W2-3 / EH-G: WO envelope was (re)scheduled. */
export const workOrderScheduled = defineEvent<
  WorkOrderEventPayload & { scheduledStart: string | null; scheduledEnd: string | null }
>('work_order.scheduled')

// ---------------------------------------------------------------------------
// Compliance.
// ---------------------------------------------------------------------------
export interface ComplianceDocReadyPayload extends DomainEventBase {
  propertyId: string
}
export const complianceDocReady = defineEvent<ComplianceDocReadyPayload>('compliance_doc.ready')

// ---------------------------------------------------------------------------
// Invoice lifecycle.
// ---------------------------------------------------------------------------
interface InvoiceEventPayload extends DomainEventBase {
  propertyId: string
  invoiceNumber: string
}
export const invoiceSent = defineEvent<InvoiceEventPayload>('invoice.sent')
export const invoiceMarkedPaid = defineEvent<InvoiceEventPayload & { paidAmountCents: number }>(
  'invoice.marked_paid',
)
export const invoiceOverdue = defineEvent<InvoiceEventPayload>('invoice.overdue')
/** W2-3 / EH-G: an invoice received a payment but is NOT yet fully paid. */
export const invoicePartialPaid = defineEvent<
  InvoiceEventPayload & { paidSoFarCents: number; remainingCents: number }
>('invoice.partial_paid')
/** W2-3 / EH-G: an invoice was voided (terminal). */
export const invoiceVoided = defineEvent<InvoiceEventPayload & { reason: string }>(
  'invoice.voided',
)

// ---------------------------------------------------------------------------
// Change order lifecycle (W2-3 / EH-G).
// ---------------------------------------------------------------------------
interface ChangeOrderEventPayload extends DomainEventBase {
  workOrderId: string | null
  invoiceId: string | null
  amountCents: number
}
export const changeOrderProposed = defineEvent<ChangeOrderEventPayload>('change_order.proposed')
export const changeOrderApproved = defineEvent<ChangeOrderEventPayload & { approvedByName: string }>(
  'change_order.approved',
)
export const changeOrderRejected = defineEvent<ChangeOrderEventPayload & { reason: string }>(
  'change_order.rejected',
)

// ---------------------------------------------------------------------------
// Admin / platform events (W2-4 / EH-H Part B / ADR-0021, ADR-0022).
// ---------------------------------------------------------------------------
export interface UserInvitedPayload extends DomainEventBase {
  /** Email of the invitee (lowercased). */
  email: string
  role: string
  inviteId: string
}
export const userInvited = defineEvent<UserInvitedPayload>('user.invited')

export interface WebhookDeliveredPayload extends DomainEventBase {
  /** Webhook subscription id. `entityId` carries the delivery row id. */
  webhookId: string
  eventType: string
  responseStatus: number | null
  attempt: number
  success: boolean
}
export const webhookDelivered = defineEvent<WebhookDeliveredPayload>('webhook.delivered')

export interface NotificationSentPayload extends DomainEventBase {
  /** The originating event the notification fanned out from. */
  sourceEventType: string
  userId: string
  channels: { inApp: boolean; email: boolean; sms: boolean }
}
export const notificationSent = defineEvent<NotificationSentPayload>('notification.sent')

// ---------------------------------------------------------------------------
// Portal events (W3-4 / EH-N + EH-O / ADR-0031/0032).
// ---------------------------------------------------------------------------
export interface SubQuoteRespondedPayload extends DomainEventBase {
  quoteId: string
  subcontractorId: string
  response: 'accepted' | 'declined'
  notes?: string
}
export const subQuoteResponded = defineEvent<SubQuoteRespondedPayload>('sub.quote_responded')

export interface SubCoiUploadedPayload extends DomainEventBase {
  docId: string
  subcontractorId: string
  expiresAt: string
}
export const subCoiUploaded = defineEvent<SubCoiUploadedPayload>('sub.coi_uploaded')

export interface SubCoiExpiringSoonPayload extends DomainEventBase {
  docId: string
  subcontractorId: string
  expiresAt: string
  daysUntilExpiry: number
}
export const subCoiExpiringSoon = defineEvent<SubCoiExpiringSoonPayload>('sub.coi_expiring_soon')

export interface HomeownerInvitedPayload extends DomainEventBase {
  email: string
  propertyId: string
  kind: string
}
export const homeownerInvited = defineEvent<HomeownerInvitedPayload>('homeowner.invited')

export interface HomeownerAcceptedPayload extends DomainEventBase {
  userId: string
  propertyId: string
}
export const homeownerAccepted = defineEvent<HomeownerAcceptedPayload>('homeowner.accepted')

export interface HomeownerQuoteViewedPayload extends DomainEventBase {
  quoteId: string
  quoteNumber: string
}
export const homeownerQuoteViewed = defineEvent<HomeownerQuoteViewedPayload>(
  'homeowner.quote_viewed',
)

export interface HomeownerInvoiceViewedPayload extends DomainEventBase {
  invoiceId: string
  invoiceNumber: string
}
export const homeownerInvoiceViewed = defineEvent<HomeownerInvoiceViewedPayload>(
  'homeowner.invoice_viewed',
)

/** Compile-time helper: union of every payload type the catalog defines. */
export type AnyDomainEventPayload =
  | PropertyCreatedPayload
  | PropertyStatusChangedPayload
  | AssessmentSignedPayload
  | QuoteEventPayload
  | WorkOrderEventPayload
  | ComplianceDocReadyPayload
  | InvoiceEventPayload
  | UserInvitedPayload
  | WebhookDeliveredPayload
  | NotificationSentPayload
  | SubQuoteRespondedPayload
  | SubCoiUploadedPayload
  | SubCoiExpiringSoonPayload
  | HomeownerInvitedPayload
  | HomeownerAcceptedPayload
  | HomeownerQuoteViewedPayload
  | HomeownerInvoiceViewedPayload
