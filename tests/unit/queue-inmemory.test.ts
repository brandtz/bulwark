/**
 * tests/unit/queue-inmemory.test.ts — W3-1 / ADR-0028.
 *
 * Validates the default in-memory queue: enqueueJob delivers to the
 * registered handler; failures retry up to `maxAttempts`; throwing on
 * every attempt eventually gives up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueJob,
  registerJobHandler,
  __resetQueueForTests,
} from '~~/server/services/_queue'

beforeEach(() => {
  __resetQueueForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  __resetQueueForTests()
})

describe('in-memory queue', () => {
  it('delivers a job to its registered handler', async () => {
    const calls: number[] = []
    registerJobHandler<number>('test.kind', async (payload) => {
      calls.push(payload)
    })
    enqueueJob<number>({ kind: 'test.kind', payload: 42 })
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toEqual([42])
  })

  it('retries on failure up to maxAttempts', async () => {
    let attempts = 0
    registerJobHandler<string>('test.flaky', async (_payload, ctx) => {
      attempts = ctx.attempt
      if (ctx.attempt < 3) throw new Error('boom')
    })
    enqueueJob<string>({ kind: 'test.flaky', payload: 'x', maxAttempts: 3 })
    // Walk through backoffs: 0 → 1s → 4s (between attempt 2 and 3).
    await vi.advanceTimersByTimeAsync(10)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(attempts).toBe(2)
    await vi.advanceTimersByTimeAsync(4100)
    expect(attempts).toBe(3)
  })

  it('stops retrying after maxAttempts', async () => {
    const tally: number[] = []
    registerJobHandler<unknown>('test.always-fails', async (_p, ctx) => {
      tally.push(ctx.attempt)
      throw new Error('always')
    })
    enqueueJob({ kind: 'test.always-fails', payload: null, maxAttempts: 2 })
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(1100)
    await vi.advanceTimersByTimeAsync(4100)
    // Two attempts then give up.
    expect(tally).toEqual([1, 2])
  })

  it('logs + drops jobs with no registered handler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    enqueueJob({ kind: 'missing.kind', payload: null })
    await vi.advanceTimersByTimeAsync(10)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
