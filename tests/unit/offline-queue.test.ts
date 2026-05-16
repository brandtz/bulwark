/**
 * tests/unit/offline-queue.test.ts — locks the FIFO drain semantics of
 * the field offline queue (W3-3 / EH-M / ADR-0029).
 *
 * # Why this test exists
 *   The offline queue is the only seam keeping photo + check-in writes
 *   alive when the crew loses signal. Its core invariants — namespace
 *   isolation, FIFO ordering, and "stop on first failure" — are easy
 *   to break in a refactor. This unit pins them at the pure-helper
 *   layer so the test stays Nuxt-free.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueItem,
  loadQueue,
  drainQueue,
  saveQueue,
  type QueuedWrite,
} from '../../app/composables/useOfflineQueue'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length(): number { return this.store.size }
  clear(): void { this.store.clear() }
  getItem(key: string): string | null { return this.store.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null }
  removeItem(key: string): void { this.store.delete(key) }
  setItem(key: string, value: string): void { this.store.set(key, value) }
}

describe('useOfflineQueue helpers', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('enqueueItem appends FIFO and roundtrips through loadQueue', () => {
    enqueueItem(storage, 'photos', { url: '/a', method: 'POST', body: { n: 1 } })
    enqueueItem(storage, 'photos', { url: '/b', method: 'POST', body: { n: 2 } })
    const items = loadQueue(storage, 'photos').items
    expect(items.map((i) => i.url)).toEqual(['/a', '/b'])
    expect(items[0]!.attempts).toBe(0)
  })

  it('isolates per namespace', () => {
    enqueueItem(storage, 'photos', { url: '/photo', method: 'POST' })
    enqueueItem(storage, 'check-in', { url: '/checkin', method: 'POST' })
    expect(loadQueue(storage, 'photos').items.map((i) => i.url)).toEqual(['/photo'])
    expect(loadQueue(storage, 'check-in').items.map((i) => i.url)).toEqual(['/checkin'])
  })

  it('drainQueue removes items in FIFO when send returns true', async () => {
    enqueueItem(storage, 'q', { url: '/1', method: 'POST' })
    enqueueItem(storage, 'q', { url: '/2', method: 'POST' })
    enqueueItem(storage, 'q', { url: '/3', method: 'POST' })

    const seen: string[] = []
    const result = await drainQueue(storage, 'q', async (item: QueuedWrite) => {
      seen.push(item.url)
      return true
    })

    expect(seen).toEqual(['/1', '/2', '/3'])
    expect(result).toEqual({ sent: 3, failed: 0, remaining: 0 })
    expect(loadQueue(storage, 'q').items).toEqual([])
  })

  it('drainQueue stops on first failure and increments attempts', async () => {
    enqueueItem(storage, 'q', { url: '/1', method: 'POST' })
    enqueueItem(storage, 'q', { url: '/2', method: 'POST' })

    let calls = 0
    const result = await drainQueue(storage, 'q', async () => {
      calls += 1
      return calls === 1 // first succeeds, second fails
    })

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.remaining).toBe(1)
    const left = loadQueue(storage, 'q').items
    expect(left).toHaveLength(1)
    expect(left[0]!.url).toBe('/2')
    expect(left[0]!.attempts).toBe(1)
  })

  it('treats a thrown send as a failure without losing the head item', async () => {
    enqueueItem(storage, 'q', { url: '/boom', method: 'POST' })
    const result = await drainQueue(storage, 'q', async () => {
      throw new Error('network blew up')
    })
    expect(result).toEqual({ sent: 0, failed: 1, remaining: 1 })
    expect(loadQueue(storage, 'q').items[0]!.attempts).toBe(1)
  })

  it('saveQueue + loadQueue tolerate corrupted JSON', () => {
    storage.setItem('bulwark.offline-queue.bad', '{not json')
    expect(loadQueue(storage, 'bad').items).toEqual([])
    saveQueue(storage, 'bad', { items: [] })
    expect(loadQueue(storage, 'bad').items).toEqual([])
  })
})
