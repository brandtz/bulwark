/**
 * app/composables/useOfflineQueue.ts — minimal client-side write buffer
 * (W3-3 / EH-M / ADR-0029).
 *
 * # Purpose
 *   Photo capture and inspection autosave both want to keep working
 *   when the crew loses signal in a remote canyon. This composable
 *   gives them a single seam to send writes through; if `navigator.
 *   onLine === false`, the write is parked in localStorage; when the
 *   browser fires `online`, the queue is drained in FIFO order.
 *
 * # Decisions (ADR-0008, ADR-0029)
 *   - **localStorage, not IndexedDB.** Seed only. localStorage is
 *     synchronous, dead simple, and easy to inspect from devtools.
 *     The size ceiling (~5 MB per origin) caps how much can queue
 *     before we fall over — acceptable for the Phase 1 seam. Phase 2
 *     promotion to IndexedDB + a service-worker `sync` event is
 *     documented in ADR-0029.
 *   - **Per-session isolation by key prefix.** The key includes a
 *     caller-supplied namespace so two screens (photos and inspection)
 *     don't fight over the same queue. Unit test pins this invariant.
 *   - **Plain `fetch` on drain.** We don't go through `$fetch` or the
 *     service RPC proxy — the queued payload already encodes the URL,
 *     method, and body, so the drain is a tight loop. Failures park
 *     the item back at the head with an incremented `attempts` counter
 *     and stop the drain. The next `online` event retries.
 *   - **No retry storm.** We drain once per `online` event, plus once
 *     on `enqueue` if we happen to be online. Higher-frequency retries
 *     belong in a service worker.
 *
 * # Failure modes documented
 *   - **Storage quota exceeded.** `enqueue` swallows the
 *     `QuotaExceededError` and returns `false`. Callers should surface
 *     a toast: "Storage full — connect to sync." Photos especially can
 *     blow the budget; ADR-0029 promotion path moves them to a Blob
 *     store.
 *   - **Stale credentials.** A queued write may 401 once the user's
 *     session has expired. The drain doesn't auto-retry on auth
 *     errors — it parks the item and stops, mirroring the on-line
 *     failure mode.
 *   - **Ordering.** FIFO within a queue namespace. Cross-namespace
 *     ordering is undefined — don't queue dependent writes across
 *     namespaces.
 */

export interface QueuedWrite {
  url: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  attempts: number
  /** Caller correlation id — surfaces in onDrained events for UX. */
  correlationId?: string
}

export interface DrainResult {
  sent: number
  failed: number
  remaining: number
}

interface QueueState {
  items: QueuedWrite[]
}

const STORAGE_PREFIX = 'bulwark.offline-queue.'

/**
 * Pure helpers — exported for the unit test. The composable body wraps
 * these in browser-only side effects (event listeners, fetch).
 */
export function loadQueue(storage: Storage, namespace: string): QueueState {
  const raw = storage.getItem(STORAGE_PREFIX + namespace)
  if (!raw) return { items: [] }
  try {
    const parsed = JSON.parse(raw) as QueueState
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] }
    return parsed
  } catch {
    return { items: [] }
  }
}

export function saveQueue(storage: Storage, namespace: string, state: QueueState): boolean {
  try {
    storage.setItem(STORAGE_PREFIX + namespace, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function enqueueItem(
  storage: Storage,
  namespace: string,
  item: Omit<QueuedWrite, 'attempts'>,
): boolean {
  const state = loadQueue(storage, namespace)
  state.items.push({ ...item, attempts: 0 })
  return saveQueue(storage, namespace, state)
}

/**
 * Drain helper. Takes a `send` function so tests can stub the network
 * without monkeypatching global fetch. Stops on the first failure and
 * leaves the failed item (with bumped `attempts`) at the head.
 */
export async function drainQueue(
  storage: Storage,
  namespace: string,
  send: (item: QueuedWrite) => Promise<boolean>,
): Promise<DrainResult> {
  const state = loadQueue(storage, namespace)
  let sent = 0
  let failed = 0
  while (state.items.length > 0) {
    const head = state.items[0]!
    let ok = false
    try {
      ok = await send(head)
    } catch {
      ok = false
    }
    if (ok) {
      state.items.shift()
      sent += 1
    } else {
      head.attempts += 1
      failed += 1
      break
    }
  }
  saveQueue(storage, namespace, state)
  return { sent, failed, remaining: state.items.length }
}

interface UseOfflineQueueOptions {
  namespace: string
}

export function useOfflineQueue(options: UseOfflineQueueOptions) {
  const { namespace } = options

  function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
  }

  function isOnline(): boolean {
    if (!isBrowser()) return true
    return navigator.onLine
  }

  function enqueue(item: Omit<QueuedWrite, 'attempts'>): boolean {
    if (!isBrowser()) return false
    const ok = enqueueItem(localStorage, namespace, item)
    if (ok && isOnline()) {
      // Fire-and-forget drain when we're online but used the queue
      // anyway (caller might have done so defensively).
      void drain()
    }
    return ok
  }

  async function sendOne(item: QueuedWrite): Promise<boolean> {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body === undefined ? undefined : JSON.stringify(item.body),
        credentials: 'same-origin',
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function drain(): Promise<DrainResult> {
    if (!isBrowser()) return { sent: 0, failed: 0, remaining: 0 }
    return await drainQueue(localStorage, namespace, sendOne)
  }

  function snapshot(): QueuedWrite[] {
    if (!isBrowser()) return []
    return loadQueue(localStorage, namespace).items
  }

  let listenerAttached = false
  function attachOnlineListener(): void {
    if (!isBrowser() || listenerAttached) return
    listenerAttached = true
    window.addEventListener('online', () => {
      void drain()
    })
  }

  return { enqueue, drain, snapshot, isOnline, attachOnlineListener }
}
