/**
 * tests/unit/csv-export.test.ts — RFC-4180 escape coverage (W3-2 / EH-K
 * / ADR-0030).
 */
import { describe, expect, it } from 'vitest'
import { escapeCsvCell, rowsToCsv } from '~~/shared/utils/reporting'

describe('escapeCsvCell', () => {
  it('passes plain text through bare', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(0)).toBe('0')
  })

  it('renders null + undefined as empty string', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('quotes cells containing commas', () => {
    expect(escapeCsvCell('Smith, John')).toBe('"Smith, John"')
  })

  it('quotes cells containing newlines (LF and CRLF)', () => {
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it('doubles internal quotes and wraps the whole cell', () => {
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""')
  })
})

describe('rowsToCsv', () => {
  interface Row { name: string; amount: number }
  const columns = [
    { header: 'name', value: (r: Row) => r.name },
    { header: 'amount', value: (r: Row) => r.amount },
  ]

  it('emits a header-only line for empty rows', () => {
    expect(rowsToCsv<Row>([], columns)).toBe('name,amount')
  })

  it('joins rows with CRLF', () => {
    const csv = rowsToCsv<Row>(
      [
        { name: 'Alice', amount: 1 },
        { name: 'Bob', amount: 2 },
      ],
      columns,
    )
    expect(csv).toBe('name,amount\r\nAlice,1\r\nBob,2')
  })

  it('escapes cells that need it without touching others', () => {
    const csv = rowsToCsv<Row>(
      [
        { name: 'Smith, John', amount: 100 },
        { name: 'Quote "Q"', amount: 200 },
      ],
      columns,
    )
    expect(csv).toBe('name,amount\r\n"Smith, John",100\r\n"Quote ""Q""",200')
  })
})
