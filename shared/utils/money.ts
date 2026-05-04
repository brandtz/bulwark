/**
 * shared/utils/money.ts — integer-cent money helpers (E5-S1).
 *
 * # Decisions (ADR-0008)
 *   - Pure functions. No locale state, no I/O. Format is always
 *     en-US dollars for v1 (Drew's market). Internationalisation lands
 *     when a non-US tenant signs.
 *   - Totals are recomputed everywhere they're rendered so the preview
 *     and the persisted `totals` field can be kept in sync without a
 *     round-trip. The mock service calls `computeQuoteTotals` on
 *     `create` and on `markSent`; the UI calls it on every keystroke.
 *   - Rounding: each step rounds half-away-from-zero to the nearest
 *     cent (`Math.round`). This matches what every accounting tool
 *     does and what Drew's existing quote PDFs already show.
 *
 * # Decision cast down
 *   - Rejected: bigint / decimal libraries (e.g. dinero.js). Overkill
 *     for $0–$50k WUI quotes; integer math in JS is exact below 2^53.
 *     Re-evaluate when international tax rules land.
 */
import type { QuoteLineItem, QuoteTotals } from '../contracts/quote'

/**
 * Format integer cents as a en-US dollar string (e.g. 150000 → "$1,500.00").
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/**
 * Parse a user-typed dollar string ("1500", "1,500.00", "$1500.5") back
 * into integer cents. Returns `null` for unparseable input.
 */
export function parseDollarsToCents(value: string): number | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  if (n < 0) return null
  return Math.round(n * 100)
}

/**
 * Compute totals for a list of line items, applying markup then tax in
 * that order. All inputs and outputs are integer cents (or whole-number
 * percentages).
 */
export function computeQuoteTotals(
  lineItems: ReadonlyArray<QuoteLineItem>,
  markupPercent: number,
  taxPercent: number,
): QuoteTotals {
  const subtotalCents = lineItems.reduce(
    (acc, li) => acc + Math.round(li.quantity * li.unitCostCents),
    0,
  )
  const markupCents = Math.round((subtotalCents * markupPercent) / 100)
  const taxableBase = subtotalCents + markupCents
  const taxCents = Math.round((taxableBase * taxPercent) / 100)
  const totalCents = subtotalCents + markupCents + taxCents
  return { subtotalCents, markupCents, taxCents, totalCents }
}
