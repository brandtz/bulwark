/**
 * tests/unit/homeowner-view-events.test.ts — confirms the
 * `homeowner.quote_viewed` and `homeowner.invoice_viewed` events
 * defined for W3-4 / W4-1 dispatch the expected payload shape.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  emit,
  on,
  __resetEventBusForTests,
} from '../../shared/events/bus'
import {
  homeownerQuoteViewed,
  homeownerInvoiceViewed,
  type HomeownerQuoteViewedPayload,
  type HomeownerInvoiceViewedPayload,
} from '../../shared/events/catalog'

beforeEach(() => {
  __resetEventBusForTests()
})

describe('homeowner view events', () => {
  it('dispatches homeowner.quote_viewed payloads to subscribers', async () => {
    const received: HomeownerQuoteViewedPayload[] = []
    on(homeownerQuoteViewed, (p) => {
      received.push(p)
    })
    await emit(homeownerQuoteViewed, {
      organizationId: 'o',
      entityId: 'q',
      actorUserId: 'u',
      timestamp: '2025-01-01T00:00:00.000Z',
      quoteId: 'q',
      quoteNumber: 'Q-2025-001',
    })
    expect(received).toHaveLength(1)
    expect(received[0]?.quoteId).toBe('q')
    expect(received[0]?.quoteNumber).toBe('Q-2025-001')
  })

  it('dispatches homeowner.invoice_viewed payloads to subscribers', async () => {
    const received: HomeownerInvoiceViewedPayload[] = []
    on(homeownerInvoiceViewed, (p) => {
      received.push(p)
    })
    await emit(homeownerInvoiceViewed, {
      organizationId: 'o',
      entityId: 'i',
      actorUserId: 'u',
      timestamp: '2025-01-01T00:00:00.000Z',
      invoiceId: 'i',
      invoiceNumber: 'INV-2025-001',
    })
    expect(received).toHaveLength(1)
    expect(received[0]?.invoiceId).toBe('i')
    expect(received[0]?.invoiceNumber).toBe('INV-2025-001')
  })
})
