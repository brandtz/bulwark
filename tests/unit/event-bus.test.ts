/**
 * tests/unit/event-bus.test.ts — W1-4 / EH-D (ADR-0017).
 *
 * Validates the four guarantees of the v1 in-process bus:
 *   1. `on()` registers a handler that fires on subsequent `emit()`.
 *   2. Multiple handlers for the same event all fire.
 *   3. A throwing handler does NOT break the emitter or sibling handlers.
 *   4. `unsubscribe()` removes only the targeted handler.
 *
 * Type-level guarantee (payload <-> event match) is enforced by
 * `defineEvent<T>()` at compile time and verified implicitly by the
 * fact that this file typechecks under `pnpm typecheck`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineEvent, emit, on, __resetEventBusForTests, __subscriberCountForTests } from '~~/shared/events/bus'

interface Payload { id: string; n: number }
const testEvent = defineEvent<Payload>('test.event')

afterEach(() => {
  __resetEventBusForTests()
})

describe('shared/events/bus', () => {
  it('delivers an emitted payload to a subscriber', async () => {
    const handler = vi.fn()
    on(testEvent, handler)
    await emit(testEvent, { id: 'a', n: 1 })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ id: 'a', n: 1 })
  })

  it('delivers to multiple subscribers', async () => {
    const a = vi.fn()
    const b = vi.fn()
    on(testEvent, a)
    on(testEvent, b)
    await emit(testEvent, { id: 'x', n: 2 })
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('isolates handler failures from siblings and the emitter', async () => {
    const good = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    on(testEvent, bad)
    on(testEvent, good)
    // emit() must not reject even when a handler throws.
    await expect(emit(testEvent, { id: 'q', n: 0 })).resolves.toBeUndefined()
    expect(good).toHaveBeenCalledOnce()
    expect(bad).toHaveBeenCalledOnce()
  })

  it('unsubscribe removes only the targeted handler', async () => {
    const keep = vi.fn()
    const drop = vi.fn()
    on(testEvent, keep)
    const off = on(testEvent, drop)
    off()
    expect(__subscriberCountForTests(testEvent)).toBe(1)
    await emit(testEvent, { id: 'z', n: 9 })
    expect(keep).toHaveBeenCalledOnce()
    expect(drop).not.toHaveBeenCalled()
  })
})
