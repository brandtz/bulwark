/**
 * tests/unit/notification-templates.test.ts — W3-1.
 *
 * Exercises `renderNotification()` for every templated event name in
 * the catalog. Each render must produce a non-empty title + body and
 * a valid severity.
 */
import { describe, expect, it } from 'vitest'
import {
  renderNotification,
  TEMPLATED_EVENT_NAMES,
} from '~~/shared/notifications/templates'

const VALID_SEVERITIES = new Set(['info', 'success', 'warning', 'error'])

const PAYLOAD_BY_EVENT: Record<string, Record<string, unknown>> = {
  'quote.accepted': { quoteNumber: 'Q-1001', entityId: '11111111-1111-1111-1111-111111111111' },
  'quote.rejected': { quoteNumber: 'Q-1002', reason: 'too high', entityId: '22222222-2222-2222-2222-222222222222' },
  'quote.expired': { quoteNumber: 'Q-1003', entityId: '33333333-3333-3333-3333-333333333333' },
  'quote.revised': { quoteNumber: 'Q-1004', revisionNumber: 2, entityId: '44444444-4444-4444-4444-444444444444' },
  'work_order.created': { workOrderNumber: 'WO-2001', entityId: '55555555-5555-5555-5555-555555555555' },
  'work_order.scheduled': { workOrderNumber: 'WO-2002', scheduledStart: '2026-06-01T09:00:00Z', entityId: '66666666-6666-6666-6666-666666666666' },
  'invoice.marked_paid': { invoiceNumber: 'INV-3001', paidAmountCents: 125000, entityId: '77777777-7777-7777-7777-777777777777' },
  'invoice.partial_paid': { invoiceNumber: 'INV-3002', paidSoFarCents: 50000, remainingCents: 75000, entityId: '88888888-8888-8888-8888-888888888888' },
  'invoice.voided': { invoiceNumber: 'INV-3003', reason: 'duplicate', entityId: '99999999-9999-9999-9999-999999999999' },
  'compliance_doc.ready': { entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
  'change_order.proposed': { amountCents: 25000, entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
  'change_order.approved': { amountCents: 30000, approvedByName: 'Drew Owens', entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
  'user.invited': { email: 'new@example.com', role: 'field', entityId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
}

describe('renderNotification', () => {
  for (const name of TEMPLATED_EVENT_NAMES) {
    it(`renders ${name}`, () => {
      const payload = PAYLOAD_BY_EVENT[name] ?? {}
      const r = renderNotification(name, payload)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.body.length).toBeGreaterThan(0)
      expect(VALID_SEVERITIES.has(r.severity)).toBe(true)
    })
  }

  it('renders a generic fallback for unknown events', () => {
    const r = renderNotification('made.up.event', { entityId: 'abc' })
    expect(r.title.length).toBeGreaterThan(0)
    expect(r.severity).toBe('info')
  })

  it('uses success severity for paid invoices', () => {
    const r = renderNotification('invoice.marked_paid', { invoiceNumber: 'X', paidAmountCents: 100, entityId: 'e' })
    expect(r.severity).toBe('success')
  })

  it('uses warning severity for voided invoices', () => {
    const r = renderNotification('invoice.voided', { invoiceNumber: 'X', reason: 'r', entityId: 'e' })
    expect(r.severity).toBe('warning')
  })
})
