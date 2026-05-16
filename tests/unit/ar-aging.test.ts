/**
 * tests/unit/ar-aging.test.ts — pure bucket math (W3-2 / EH-K / ADR-0030).
 */
import { describe, expect, it } from 'vitest'
import { aggregateArAging, bucketArAging } from '~~/shared/utils/reporting'

describe('bucketArAging', () => {
  it('classifies the canonical boundaries', () => {
    expect(bucketArAging(0)).toBe('0-30')
    expect(bucketArAging(30)).toBe('0-30')
    expect(bucketArAging(31)).toBe('31-60')
    expect(bucketArAging(60)).toBe('31-60')
    expect(bucketArAging(61)).toBe('61-90')
    expect(bucketArAging(90)).toBe('61-90')
    expect(bucketArAging(91)).toBe('90+')
    expect(bucketArAging(365)).toBe('90+')
  })

  it('clamps negative days to 0-30', () => {
    expect(bucketArAging(-5)).toBe('0-30')
  })

  it('floors fractional days', () => {
    expect(bucketArAging(30.9)).toBe('0-30')
    expect(bucketArAging(31.1)).toBe('31-60')
  })
})

describe('aggregateArAging', () => {
  it('returns four buckets even with empty input', () => {
    const rows = aggregateArAging([])
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.bucket)).toEqual(['0-30', '31-60', '61-90', '90+'])
    expect(rows.every((r) => r.count === 0 && r.totalCents === 0)).toBe(true)
  })

  it('sums counts and balances per bucket', () => {
    const rows = aggregateArAging([
      { daysOpen: 5, balanceCents: 1000 },
      { daysOpen: 25, balanceCents: 2500 },
      { daysOpen: 45, balanceCents: 4000 },
      { daysOpen: 95, balanceCents: 9000 },
      { daysOpen: 120, balanceCents: 11_000 },
    ])
    const byBucket = Object.fromEntries(rows.map((r) => [r.bucket, r]))
    expect(byBucket['0-30']).toMatchObject({ count: 2, totalCents: 3500 })
    expect(byBucket['31-60']).toMatchObject({ count: 1, totalCents: 4000 })
    expect(byBucket['61-90']).toMatchObject({ count: 0, totalCents: 0 })
    expect(byBucket['90+']).toMatchObject({ count: 2, totalCents: 20_000 })
  })

  it('ignores zero / negative balances', () => {
    const rows = aggregateArAging([
      { daysOpen: 10, balanceCents: 0 },
      { daysOpen: 10, balanceCents: -500 },
      { daysOpen: 10, balanceCents: 100 },
    ])
    expect(rows.find((r) => r.bucket === '0-30')).toMatchObject({ count: 1, totalCents: 100 })
  })
})
