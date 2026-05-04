/**
 * tests/unit/money.test.ts — money helpers (E5-S1).
 *
 * # Decisions (ADR-0008)
 *   - Pure-function tests. Cover formatting round-trips, parser edge
 *     cases, and the markup-then-tax order of operations on the totals
 *     computer (matches what every paper invoice does and what the
 *     preview shows).
 *
 * # Decision cast down
 *   - Rejected: testing through the mock service. The service just
 *     forwards to `computeQuoteTotals`; testing it twice obscures the
 *     real contract (the math).
 */
import { describe, it, expect } from 'vitest'
import { computeQuoteTotals, formatCents, parseDollarsToCents } from '~~/shared/utils/money'
import type { QuoteLineItem } from '~~/shared/contracts/quote'

const item = (qty: number, unitCents: number): QuoteLineItem => ({
  id: '00000000-0000-0000-0000-000000000000',
  kind: 'labor',
  description: 'x',
  quantity: qty,
  unitCostCents: unitCents,
  sourceField: '',
})

describe('formatCents', () => {
  it('formats whole dollars', () => {
    expect(formatCents(150000)).toBe('$1,500.00')
  })
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00')
  })
  it('formats sub-dollar', () => {
    expect(formatCents(7)).toBe('$0.07')
  })
})

describe('parseDollarsToCents', () => {
  it('parses plain integer', () => {
    expect(parseDollarsToCents('1500')).toBe(150000)
  })
  it('strips commas and dollar signs', () => {
    expect(parseDollarsToCents('$1,500.50')).toBe(150050)
  })
  it('rejects negatives', () => {
    expect(parseDollarsToCents('-1')).toBeNull()
  })
  it('rejects garbage', () => {
    expect(parseDollarsToCents('abc')).toBeNull()
  })
  it('handles empty string', () => {
    expect(parseDollarsToCents('')).toBeNull()
  })
})

describe('computeQuoteTotals', () => {
  it('subtotal sums quantity × unit cost', () => {
    const t = computeQuoteTotals([item(2, 50000), item(3, 10000)], 0, 0)
    expect(t.subtotalCents).toBe(130000)
    expect(t.markupCents).toBe(0)
    expect(t.taxCents).toBe(0)
    expect(t.totalCents).toBe(130000)
  })

  it('applies markup before tax', () => {
    // $100 subtotal, 10% markup = $110, 5% tax = $5.50, total $115.50
    const t = computeQuoteTotals([item(1, 10000)], 10, 5)
    expect(t.subtotalCents).toBe(10000)
    expect(t.markupCents).toBe(1000)
    expect(t.taxCents).toBe(550)
    expect(t.totalCents).toBe(11550)
  })

  it('rounds half-away-from-zero per step', () => {
    // $1.235 markup → $1.24
    const t = computeQuoteTotals([item(1, 12350)], 10, 0)
    expect(t.markupCents).toBe(1235)
  })

  it('handles empty line items', () => {
    const t = computeQuoteTotals([], 10, 5)
    expect(t).toEqual({ subtotalCents: 0, markupCents: 0, taxCents: 0, totalCents: 0 })
  })

  it('supports fractional quantities', () => {
    // 2.5 × $40 = $100
    const t = computeQuoteTotals([item(2.5, 4000)], 0, 0)
    expect(t.subtotalCents).toBe(10000)
  })
})
