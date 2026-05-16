/**
 * tests/unit/metrics.test.ts — counter increment + snapshot
 * (W3-5 / EH-Q / ADR-0034).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  COUNTERS,
  incCounter,
  readCounter,
  snapshotMetrics,
  __resetCountersForTests,
} from '~~/server/utils/metrics'

describe('metrics counters', () => {
  beforeEach(() => {
    __resetCountersForTests()
  })

  it('starts every counter at zero', () => {
    const snap = snapshotMetrics()
    for (const name of Object.values(COUNTERS)) {
      expect(snap[name]).toBe(0)
    }
  })

  it('increments by 1 by default', () => {
    incCounter(COUNTERS.requestsTotal)
    incCounter(COUNTERS.requestsTotal)
    expect(readCounter(COUNTERS.requestsTotal)).toBe(2)
  })

  it('supports custom increments', () => {
    incCounter(COUNTERS.jobsEnqueuedTotal, 5)
    expect(readCounter(COUNTERS.jobsEnqueuedTotal)).toBe(5)
  })

  it('snapshot returns a stable point-in-time copy', () => {
    incCounter(COUNTERS.webhooksDeliveredTotal)
    const snap = snapshotMetrics()
    incCounter(COUNTERS.webhooksDeliveredTotal)
    // mutation after snapshot must NOT affect the prior copy.
    expect(snap[COUNTERS.webhooksDeliveredTotal]).toBe(1)
  })
})
