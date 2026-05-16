/**
 * shared/utils/reporting.ts — pure helpers for the reporting slice
 * (W3-2 / EH-K / ADR-0030).
 *
 * # What this file owns
 *   - `bucketArAging`: classify an aging-days integer into one of the
 *     four canonical buckets `'0-30' | '31-60' | '61-90' | '90+'`.
 *   - `aggregateArAging`: roll a flat list of `{ daysOpen, balanceCents }`
 *     rows into the contract `ArAgingRow[]` (every bucket present,
 *     totalCents/count summed, zero-filled rows for empty buckets).
 *   - `escapeCsvCell` + `rowsToCsv`: tiny RFC-4180-style CSV builder.
 *     Hand-rolled per ADR-0030 (no `papaparse` / `csv-stringify` deps).
 *
 * # Decisions (ADR-0008, ADR-0030)
 *   - Buckets are pure functions taking integers; no Date arithmetic
 *     leaks into the helper so tests can pin behaviour without mocking
 *     `Date.now()`. Callers compute `daysOpen` once at the call site.
 *   - CSV escaping follows the "double-quote a cell when it contains a
 *     comma, newline (CR or LF), or double quote; double-up internal
 *     quotes" rule — small enough to inline-spec in a unit test.
 *   - `rowsToCsv` emits CRLF line endings; spreadsheet apps (Excel,
 *     Numbers, Sheets) all accept either, but CRLF is what RFC 4180
 *     prescribes and what Excel's "From CSV" wizard re-opens cleanest.
 *
 * # Decisions cast down
 *   - Rejected: BOM prefix for Excel's UTF-8 detection. Adds noise to
 *     test snapshots; Excel 2016+ on every supported OS reads UTF-8
 *     without it.
 */
import type { ArAgingBucket, ArAgingRow } from '../contracts/reporting'

// ----------------------------------------------------------------------------
// AR aging.
// ----------------------------------------------------------------------------
export const AR_AGING_BUCKETS: readonly ArAgingBucket[] = [
  '0-30',
  '31-60',
  '61-90',
  '90+',
] as const

/** Classify days-open into the canonical bucket. Negatives clamp to 0-30. */
export function bucketArAging(daysOpen: number): ArAgingBucket {
  const d = Math.max(0, Math.floor(daysOpen))
  if (d <= 30) return '0-30'
  if (d <= 60) return '31-60'
  if (d <= 90) return '61-90'
  return '90+'
}

export interface ArAgingInputRow {
  daysOpen: number
  balanceCents: number
}

/**
 * Roll input rows into the four-bucket shape. Always returns four rows,
 * one per bucket, even when zero-filled — the chart component depends
 * on the fixed shape.
 */
export function aggregateArAging(rows: ArAgingInputRow[]): ArAgingRow[] {
  const tally: Record<ArAgingBucket, { count: number; totalCents: number }> = {
    '0-30': { count: 0, totalCents: 0 },
    '31-60': { count: 0, totalCents: 0 },
    '61-90': { count: 0, totalCents: 0 },
    '90+': { count: 0, totalCents: 0 },
  }
  for (const row of rows) {
    if (row.balanceCents <= 0) continue
    const bucket = bucketArAging(row.daysOpen)
    tally[bucket].count += 1
    tally[bucket].totalCents += row.balanceCents
  }
  return AR_AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: tally[bucket].count,
    totalCents: tally[bucket].totalCents,
  }))
}

// ----------------------------------------------------------------------------
// CSV.
// ----------------------------------------------------------------------------
const CSV_QUOTE_PATTERN = /[",\r\n]/

/**
 * Returns `value` either bare or wrapped in double quotes with any
 * internal double quotes doubled, per RFC 4180.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : String(value)
  if (!CSV_QUOTE_PATTERN.test(str)) return str
  return `"${str.replace(/"/g, '""')}"`
}

export interface CsvColumn<T> {
  header: string
  /** Returns the raw cell value; CSV-escaping is applied by `rowsToCsv`. */
  value: (row: T) => unknown
}

/**
 * Serialize a list of rows into a CRLF-delimited CSV string. The header
 * line is always emitted; pass an empty `rows` array to emit just the
 * header.
 */
export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = []
  lines.push(columns.map((c) => escapeCsvCell(c.header)).join(','))
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(','))
  }
  return lines.join('\r\n')
}
