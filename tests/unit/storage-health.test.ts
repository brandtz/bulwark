/**
 * tests/unit/storage-health.test.ts — L01-S4 probe + contract shape.
 *
 * The probe is exercised against an in-memory fake driver (no DB, no fs):
 * happy round-trip, head-miss, throwing put, and best-effort cleanup. The
 * legacy census SQL is integration-tested (tests/integration/
 * storage-health.real.test.ts) because its correctness IS the SQL.
 */
import { describe, expect, it } from 'vitest'
import { probeStorageDriver } from '../../server/services/storage/health'
import { StorageHealthOutputSchema } from '../../shared/contracts/storage'
import type {
  HeadResult,
  PutObjectInput,
  SignedDownloadInput,
  SignedDownloadResult,
  SignedUploadInput,
  SignedUploadResult,
  StorageDriver,
} from '../../server/services/storage/types'

function fakeDriver(overrides: Partial<StorageDriver> = {}): StorageDriver & {
  deleted: string[]
} {
  const store = new Map<string, { size: number; contentType: string }>()
  const deleted: string[] = []
  return {
    name: 'fs' as const,
    deleted,
    async putObject(input: PutObjectInput) {
      store.set(input.key, { size: input.body.length, contentType: input.contentType })
      return { key: input.key }
    },
    async getSignedUploadUrl(_input: SignedUploadInput): Promise<SignedUploadResult> {
      throw new Error('not used by probe')
    },
    async getSignedDownloadUrl(_input: SignedDownloadInput): Promise<SignedDownloadResult> {
      throw new Error('not used by probe')
    },
    async headObject(key: string): Promise<HeadResult> {
      const hit = store.get(key)
      return hit ? { exists: true, size: hit.size, contentType: hit.contentType } : { exists: false }
    },
    async deleteObject(key: string) {
      store.delete(key)
      deleted.push(key)
    },
    ...overrides,
  }
}

describe('probeStorageDriver (L01-S4)', () => {
  it('happy path: put → head → delete returns ok with latency', async () => {
    const driver = fakeDriver()
    const result = await probeStorageDriver(driver, '00000000-0000-4000-8000-00000000aaaa')
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
    // Probe cleaned up after itself.
    expect(driver.deleted).toHaveLength(1)
  })

  it('probe key is tenant-prefixed under the document entity', async () => {
    const driver = fakeDriver()
    await probeStorageDriver(driver, '00000000-0000-4000-8000-00000000aaaa')
    expect(driver.deleted[0]).toMatch(
      /^00000000-0000-4000-8000-00000000aaaa\/document\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/,
    )
  })

  it('reports not-ok when the object is invisible after put', async () => {
    const driver = fakeDriver({ headObject: async () => ({ exists: false }) })
    const result = await probeStorageDriver(driver, '00000000-0000-4000-8000-00000000aaaa')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not visible/i)
  })

  it('never throws: a failing put degrades to ok:false with the error message', async () => {
    const driver = fakeDriver({
      putObject: async () => {
        throw new Error('bucket unreachable')
      },
    })
    const result = await probeStorageDriver(driver, '00000000-0000-4000-8000-00000000aaaa')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('bucket unreachable')
  })

  it('cleanup failure after a primary failure is swallowed (best-effort)', async () => {
    const driver = fakeDriver({
      headObject: async () => {
        throw new Error('head exploded')
      },
      deleteObject: async () => {
        throw new Error('delete exploded too')
      },
    })
    const result = await probeStorageDriver(driver, '00000000-0000-4000-8000-00000000aaaa')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('head exploded')
  })
})

describe('StorageHealthOutputSchema (L01-S4)', () => {
  it('round-trips a full health payload', () => {
    const parsed = StorageHealthOutputSchema.parse({
      ts: new Date().toISOString(),
      driver: 'fs',
      probe: { ok: true, latencyMs: 12 },
      legacyAssets: [
        { table: 'property_photos', column: 'url', count: 3, intentionalInline: false },
        { table: 'users', column: 'avatar_url', count: 1, intentionalInline: true },
      ],
      organizationId: '00000000-0000-4000-8000-00000000aaaa',
    })
    expect(parsed.legacyAssets).toHaveLength(2)
  })

  it('rejects a negative count', () => {
    const bad = StorageHealthOutputSchema.safeParse({
      ts: new Date().toISOString(),
      driver: 'fs',
      probe: { ok: true, latencyMs: 1 },
      legacyAssets: [{ table: 't', column: 'c', count: -1, intentionalInline: false }],
      organizationId: '00000000-0000-4000-8000-00000000aaaa',
    })
    expect(bad.success).toBe(false)
  })
})
