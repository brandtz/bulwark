/**
 * shared/notifications/templates.ts — event → notification renderer
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Single switchboard keyed by the catalog event name string
 *     (e.g. `quote.accepted`). Adding a new template is a one-case
 *     change here. Unknown event types render a generic fallback so
 *     the bus never blocks on a missing template.
 *   - Renderers are pure functions over the payload. They return
 *     `{ title, body, severity, relatedEntityType, relatedEntityId }`
 *     so the subscriber can stamp the in-app row, the email subject,
 *     and the SMS body from the same source.
 *   - Body strings stay short (≤140 chars where practical) so a future
 *     SMS path doesn't need a re-render. Email decoration (HTML
 *     wrapping, footer) is the provider's job.
 *   - Money is rendered as `$X.YY` from integer cents — the source
 *     payload already carries cents. We never re-format on the client.
 *
 * # Decisions cast down
 *   - Rejected: storing template strings in `shared/labels/defaults.ts`
 *     and resolving via `useLabels()`. Notification templates need
 *     structural payload data (work order numbers, dollar amounts) —
 *     the label registry is for static UI text. Phase 2 can add a
 *     CMS layer on top of the keys here.
 *   - Rejected: rendering severity as `info` for everything. Severity
 *     should be honest: invoice voided is `warning`, work order
 *     completed is `success`. The bell + feed bias UI accordingly.
 */
export type NotificationSeverityLevel = 'info' | 'success' | 'warning' | 'error'

export interface RenderedNotification {
  title: string
  body: string
  severity: NotificationSeverityLevel
  relatedEntityType: string | null
  relatedEntityId: string | null
}

/** Cents → `$1,234.56`. */
function fmtMoney(cents: number | undefined | null): string {
  const n = Number(cents ?? 0) / 100
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

type AnyRecord = Record<string, unknown>
function s(payload: AnyRecord, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v : ''
}
function n(payload: AnyRecord, key: string): number {
  const v = payload[key]
  return typeof v === 'number' ? v : 0
}

/**
 * Map an event name + its payload into a notification render. The
 * event-name key is the dot-form (e.g. `quote.accepted`), matching
 * `catalog.ts` definitions.
 */
export function renderNotification(
  eventName: string,
  payload: unknown,
): RenderedNotification {
  const p = (payload ?? {}) as AnyRecord
  const propId = (p.propertyId as string | undefined) ?? null
  const entityId = (p.entityId as string | undefined) ?? null
  switch (eventName) {
    case 'quote.accepted':
      return {
        title: `Quote ${s(p, 'quoteNumber')} accepted`,
        body: `The homeowner accepted quote ${s(p, 'quoteNumber')}.`,
        severity: 'success',
        relatedEntityType: 'quote',
        relatedEntityId: entityId,
      }
    case 'quote.rejected': {
      const reason = s(p, 'reason')
      return {
        title: `Quote ${s(p, 'quoteNumber')} rejected`,
        body: reason
          ? `Quote ${s(p, 'quoteNumber')} was rejected: ${reason}.`
          : `Quote ${s(p, 'quoteNumber')} was rejected.`,
        severity: 'warning',
        relatedEntityType: 'quote',
        relatedEntityId: entityId,
      }
    }
    case 'quote.expired':
      return {
        title: `Quote ${s(p, 'quoteNumber')} expired`,
        body: `Quote ${s(p, 'quoteNumber')} reached its expiry without acceptance.`,
        severity: 'warning',
        relatedEntityType: 'quote',
        relatedEntityId: entityId,
      }
    case 'quote.revised':
      return {
        title: `Quote ${s(p, 'quoteNumber')} revised`,
        body: `A new revision (#${n(p, 'revisionNumber') || '?'}) was created from quote ${s(p, 'quoteNumber')}.`,
        severity: 'info',
        relatedEntityType: 'quote',
        relatedEntityId: entityId,
      }
    case 'work_order.created':
      return {
        title: `Work order ${s(p, 'workOrderNumber')} created`,
        body: `Work order ${s(p, 'workOrderNumber')} is ready to schedule.`,
        severity: 'info',
        relatedEntityType: 'work_order',
        relatedEntityId: entityId,
      }
    case 'work_order.scheduled': {
      const start = s(p, 'scheduledStart')
      return {
        title: `Work order ${s(p, 'workOrderNumber')} scheduled`,
        body: start
          ? `Work order ${s(p, 'workOrderNumber')} is scheduled to start ${start}.`
          : `Work order ${s(p, 'workOrderNumber')} schedule updated.`,
        severity: 'info',
        relatedEntityType: 'work_order',
        relatedEntityId: entityId,
      }
    }
    case 'invoice.marked_paid':
      return {
        title: `Invoice ${s(p, 'invoiceNumber')} paid`,
        body: `Invoice ${s(p, 'invoiceNumber')} marked paid for ${fmtMoney(n(p, 'paidAmountCents'))}.`,
        severity: 'success',
        relatedEntityType: 'invoice',
        relatedEntityId: entityId,
      }
    case 'invoice.partial_paid':
      return {
        title: `Partial payment on ${s(p, 'invoiceNumber')}`,
        body: `Paid ${fmtMoney(n(p, 'paidSoFarCents'))}; ${fmtMoney(n(p, 'remainingCents'))} remaining on invoice ${s(p, 'invoiceNumber')}.`,
        severity: 'info',
        relatedEntityType: 'invoice',
        relatedEntityId: entityId,
      }
    case 'invoice.voided':
      return {
        title: `Invoice ${s(p, 'invoiceNumber')} voided`,
        body: `Invoice ${s(p, 'invoiceNumber')} was voided: ${s(p, 'reason') || 'no reason given'}.`,
        severity: 'warning',
        relatedEntityType: 'invoice',
        relatedEntityId: entityId,
      }
    case 'compliance_doc.ready':
      return {
        title: 'Compliance document ready',
        body: 'A compliance PDF is ready to send to the homeowner.',
        severity: 'info',
        relatedEntityType: 'compliance_doc',
        relatedEntityId: entityId,
      }
    case 'change_order.proposed':
      return {
        title: 'Change order proposed',
        body: `A change order for ${fmtMoney(n(p, 'amountCents'))} is awaiting approval.`,
        severity: 'info',
        relatedEntityType: 'change_order',
        relatedEntityId: entityId,
      }
    case 'change_order.approved':
      return {
        title: 'Change order approved',
        body: `Change order for ${fmtMoney(n(p, 'amountCents'))} approved by ${s(p, 'approvedByName') || 'an admin'}.`,
        severity: 'success',
        relatedEntityType: 'change_order',
        relatedEntityId: entityId,
      }
    case 'user.invited':
      return {
        title: 'Teammate invited',
        body: `${s(p, 'email')} was invited as ${s(p, 'role')}.`,
        severity: 'info',
        relatedEntityType: 'user_invite',
        relatedEntityId: entityId,
      }
    case 'sub.quote_responded': {
      const response = s(p, 'response')
      return {
        title: `Subcontractor ${response} a quote`,
        body: `A subcontractor ${response} the requested quote.`,
        severity: response === 'accepted' ? 'success' : 'warning',
        relatedEntityType: 'quote',
        relatedEntityId: s(p, 'quoteId') || entityId,
      }
    }
    case 'sub.coi_uploaded':
      return {
        title: 'New COI uploaded',
        body: `A subcontractor uploaded a Certificate of Insurance; expires ${s(p, 'expiresAt').slice(0, 10) || 'soon'}.`,
        severity: 'info',
        relatedEntityType: 'sub_coi_doc',
        relatedEntityId: s(p, 'docId') || entityId,
      }
    case 'sub.coi_expiring_soon':
      return {
        title: 'COI expiring soon',
        body: `A subcontractor's COI expires in ${n(p, 'daysUntilExpiry') || 0} days.`,
        severity: 'warning',
        relatedEntityType: 'sub_coi_doc',
        relatedEntityId: s(p, 'docId') || entityId,
      }
    case 'homeowner.invited':
      return {
        title: 'Homeowner invited',
        body: `${s(p, 'email')} was invited to the homeowner portal.`,
        severity: 'info',
        relatedEntityType: 'homeowner_user',
        relatedEntityId: entityId,
      }
    case 'homeowner.accepted':
      return {
        title: 'Homeowner joined the portal',
        body: 'A homeowner accepted their portal invite.',
        severity: 'success',
        relatedEntityType: 'homeowner_user',
        relatedEntityId: entityId,
      }
    case 'homeowner.quote_viewed':
      return {
        title: 'Homeowner viewed a quote',
        body: `The homeowner viewed quote ${s(p, 'quoteNumber')}.`,
        severity: 'info',
        relatedEntityType: 'quote',
        relatedEntityId: s(p, 'quoteId') || entityId,
      }
    case 'homeowner.invoice_viewed':
      return {
        title: 'Homeowner viewed an invoice',
        body: `The homeowner viewed invoice ${s(p, 'invoiceNumber')}.`,
        severity: 'info',
        relatedEntityType: 'invoice',
        relatedEntityId: s(p, 'invoiceId') || entityId,
      }
    default:
      return {
        title: humanizeEventName(eventName),
        body: `An update occurred (${eventName}).`,
        severity: 'info',
        relatedEntityType: propId ? 'property' : null,
        relatedEntityId: propId ?? entityId,
      }
  }
}

function humanizeEventName(name: string): string {
  const parts = name.split('.')
  if (parts.length === 0) return name
  return parts
    .map((p) => p.replace(/_/g, ' '))
    .join(' — ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Event names with a dedicated template (used by tests + docs). */
export const TEMPLATED_EVENT_NAMES = [
  'quote.accepted',
  'quote.rejected',
  'quote.expired',
  'quote.revised',
  'work_order.created',
  'work_order.scheduled',
  'invoice.marked_paid',
  'invoice.partial_paid',
  'invoice.voided',
  'compliance_doc.ready',
  'change_order.proposed',
  'change_order.approved',
  'user.invited',
  'sub.quote_responded',
  'sub.coi_uploaded',
  'sub.coi_expiring_soon',
  'homeowner.invited',
  'homeowner.accepted',
  'homeowner.quote_viewed',
  'homeowner.invoice_viewed',
] as const
