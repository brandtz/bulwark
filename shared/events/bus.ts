/**
 * shared/events/bus.ts — Bulwark domain event bus (W1-4 / EH-D / ADR-0017).
 *
 * # Decisions (ADR-0008, ADR-0017)
 *   - **Synchronous v1.** Subscribers run inline (Promise.allSettled)
 *     immediately after `emit()`. No queue, no out-of-process worker,
 *     no retry. The shape is pub/sub-ready: every subscriber is a
 *     `(payload) => Promise<void>` so promoting the bus to pg-boss in
 *     v2 is a behind-the-curtain swap (the v2 emit will `boss.send` and
 *     the subscriber registration will become `boss.work`).
 *   - **Post-transaction emit.** Real services call `emit()` AFTER
 *     `withAudit()` returns success. A failed transaction therefore
 *     fires no downstream effect — by construction. This is the single
 *     most important property of the v1 bus: events fire IFF the
 *     originating mutation committed. See the rich-comment in
 *     `_tx.ts` for the dual rule (audit row commits/rolls back WITH
 *     the source write).
 *   - **Handler failure isolation.** A throwing subscriber DOES NOT
 *     bubble up to the emitter. We use `Promise.allSettled` and log
 *     each rejection. The status-pipeline handler in
 *     `server/services/_subscribers/property-status.ts` further audits
 *     its own failures so an operator can replay.
 *   - **Singleton per process.** Cached on `globalThis` so SSR + CSR
 *     share a single bus instance even when this module is loaded
 *     multiple times under HMR or test isolation. v2 will replace the
 *     in-process map with a pg-boss client, also globalThis-cached.
 *   - **Typed payloads.** `defineEvent<T>()` returns a brand
 *     (`{ name }`) carrying the payload type at compile time. `emit`
 *     and `on` infer the payload from the event handle — no string-key
 *     casting in callers.
 *
 * # Decision cast down
 *   - Rejected: making emit `await`-able and surfacing subscriber
 *     errors. Subscribers are side-effects (auto-status, future
 *     notifications); the originating mutation has already committed
 *     and should not be ergonomically tied to their failure. Logging +
 *     audit suffices.
 *   - Rejected: per-event class-based registration (à la
 *     EventEmitter). Function-shaped subscribers compose better with
 *     the future pg-boss `boss.work(name, handler)` API.
 *   - Rejected: persisting emits to an `events` table at v1.
 *     audit_log already records every domain mutation; an additional
 *     events log is duplicate write surface until the bus goes async.
 *
 * # Migration path to v2 (pg-boss)
 *   - `emit(event, payload)` → `await boss.send(event.name, payload)`.
 *   - `on(event, handler)` → `await boss.work(event.name, handler)`.
 *   - The contract here stays identical; callers see a behaviour
 *     change (delivery becomes asynchronous) but no API change.
 */

/** Branded event handle. `T` is the payload type, carried via phantom. */
export interface DomainEvent<T> {
  readonly name: string
  /** Phantom marker — only used for type inference. */
  readonly __payload?: T
}

export type DomainEventHandler<T> = (payload: T) => void | Promise<void>

/**
 * Define a typed event. The returned handle is what callers pass to
 * `emit()` and `on()`; the payload type is inferred from `T`.
 */
export function defineEvent<T>(name: string): DomainEvent<T> {
  return Object.freeze({ name })
}

interface BusInternal {
  handlers: Map<string, Set<DomainEventHandler<unknown>>>
  /** W2-4: wildcard subscribers fire for every emit. Used by webhook dispatcher. */
  wildcardHandlers: Set<(name: string, payload: unknown) => void | Promise<void>>
}

const GLOBAL_KEY = '__bulwarkEventBus__'

function getBus(): BusInternal {
  const g = globalThis as unknown as Record<string, BusInternal | undefined>
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { handlers: new Map(), wildcardHandlers: new Set() }
  }
  // Defensive: re-init for older bus shapes lingering on globalThis under HMR.
  if (!g[GLOBAL_KEY]!.wildcardHandlers) g[GLOBAL_KEY]!.wildcardHandlers = new Set()
  return g[GLOBAL_KEY]!
}

/**
 * Subscribe `handler` to `event`. Returns an unsubscribe function.
 * Subscriptions are idempotent — registering the same handler twice
 * fires it once. Useful for re-entrant `registerXSubscribers()` calls
 * in dev HMR / test setup.
 */
export function on<T>(event: DomainEvent<T>, handler: DomainEventHandler<T>): () => void {
  const bus = getBus()
  let set = bus.handlers.get(event.name)
  if (!set) {
    set = new Set()
    bus.handlers.set(event.name, set)
  }
  set.add(handler as DomainEventHandler<unknown>)
  return () => set!.delete(handler as DomainEventHandler<unknown>)
}

/**
 * Emit `event` with `payload`. All subscribers run sequentially via
 * `Promise.allSettled`. Rejections are logged but never thrown — see
 * the header decision on handler-failure isolation.
 *
 * v1: synchronous (await-able for tests). v2: pg-boss enqueue.
 */
export async function emit<T>(event: DomainEvent<T>, payload: T): Promise<void> {
  const bus = getBus()
  const set = bus.handlers.get(event.name)
  const wildcards = Array.from(bus.wildcardHandlers)
  const named = set && set.size > 0 ? Array.from(set) : []
  if (named.length === 0 && wildcards.length === 0) return
  const results = await Promise.allSettled([
    ...named.map((h) => Promise.resolve().then(() => h(payload))),
    ...wildcards.map((h) => Promise.resolve().then(() => h(event.name, payload))),
  ])
  for (const r of results) {
    if (r.status === 'rejected') {
       
      console.error(`[bulwark.events] subscriber rejected on '${event.name}':`, r.reason)
    }
  }
}

/**
 * W2-4: subscribe to ALL events. The handler receives `(eventName, payload)`.
 * Used by the webhook dispatcher to fan-out arbitrary events to outbound
 * HTTP subscribers without hard-coding the catalog list.
 */
export function onAny(
  handler: (name: string, payload: unknown) => void | Promise<void>,
): () => void {
  const bus = getBus()
  bus.wildcardHandlers.add(handler)
  return () => bus.wildcardHandlers.delete(handler)
}

/**
 * Test-only: clear all subscribers. Useful between vitest specs so
 * registrations from one test don't leak into the next.
 */
export function __resetEventBusForTests(): void {
  const bus = getBus()
  bus.handlers.clear()
  bus.wildcardHandlers.clear()
}

/** Test-only: count of subscribers for a given event. */
export function __subscriberCountForTests<T>(event: DomainEvent<T>): number {
  return getBus().handlers.get(event.name)?.size ?? 0
}
