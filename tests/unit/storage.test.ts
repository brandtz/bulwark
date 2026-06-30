/**
 * tests/unit/storage.test.ts — L01-S1 object storage service.
 *
 * Covers the pure + filesystem-driver pieces (the R2 driver + HTTP endpoints are
 * exercised by L01-S2 integration/e2e): key gen/parse, upload validation, env-
 * based driver selection (prod fails closed to r2), filesystem signed-URL HMAC
 * (valid / expired / tampered), and a fs round-trip (put → head → read → delete).
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildStorageKey, parseStorageKey } from '~~/server/services/storage/keys'
import { selectStorageDriverName } from '~~/server/services/storage'
import {
  FsDriver,
  fsReadObject,
  signFsPath,
  verifyFsSignature,
} from '~~/server/services/storage/fs-driver'
import {
  validateUpload,
  StorageObjectKeySchema,
} from '~~/shared/contracts/storage'

describe('storage key', () => {
  it('builds a tenant-prefixed key and parses it back', () => {
    const tenantId = randomUUID()
    const entityId = randomUUID()
    const key = buildStorageKey({ tenantId, entity: 'property_photo', entityId, contentType: 'image/jpeg' })
    expect(key.startsWith(`${tenantId}/property_photo/${entityId}/`)).toBe(true)
    expect(key.endsWith('.jpg')).toBe(true)
    expect(StorageObjectKeySchema.safeParse(key).success).toBe(true)

    const parsed = parseStorageKey(key)
    expect(parsed.tenantId).toBe(tenantId)
    expect(parsed.entity).toBe('property_photo')
    expect(parsed.entityId).toBe(entityId)
  })

  it('throws on an unmappable content type', () => {
    expect(() =>
      buildStorageKey({ tenantId: randomUUID(), entity: 'document', entityId: randomUUID(), contentType: 'application/zip' }),
    ).toThrow()
  })

  it('rejects a traversal / malformed key', () => {
    expect(() => parseStorageKey('../../etc/passwd')).toThrow()
    expect(StorageObjectKeySchema.safeParse('a/b/c').success).toBe(false)
  })
})

describe('validateUpload', () => {
  it('allows an in-policy upload', () => {
    expect(validateUpload('property_photo', 'image/jpeg', 1024)).toEqual({ ok: true })
  })
  it('rejects a disallowed MIME for the entity', () => {
    const r = validateUpload('document', 'image/png', 1024)
    expect(r.ok).toBe(false)
  })
  it('rejects an oversize upload', () => {
    const r = validateUpload('avatar', 'image/png', 50 * 1024 * 1024)
    expect(r.ok).toBe(false)
  })
  it('rejects an empty upload', () => {
    const r = validateUpload('property_photo', 'image/jpeg', 0)
    expect(r.ok).toBe(false)
  })
})

describe('selectStorageDriverName', () => {
  it('defaults to fs in dev/test', () => {
    expect(selectStorageDriverName({ NODE_ENV: 'test' })).toBe('fs')
    expect(selectStorageDriverName({ NODE_ENV: 'development' })).toBe('fs')
  })
  it('honors an explicit r2 opt-in outside production', () => {
    expect(selectStorageDriverName({ NODE_ENV: 'development', BULWARK_STORAGE_DRIVER: 'r2' })).toBe('r2')
  })
  it('fails closed to r2 in production regardless of the flag', () => {
    expect(selectStorageDriverName({ NODE_ENV: 'production' })).toBe('r2')
    expect(selectStorageDriverName({ NODE_ENV: 'production', BULWARK_STORAGE_DRIVER: 'fs' })).toBe('r2')
  })
})

describe('filesystem signed-URL HMAC', () => {
  const key = `${randomUUID()}/avatar/${randomUUID()}/${randomUUID()}.png`

  it('verifies a fresh signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    expect(verifyFsSignature(key, exp, signFsPath(key, exp))).toBe(true)
  })
  it('rejects an expired signature', () => {
    const exp = Math.floor(Date.now() / 1000) - 1
    expect(verifyFsSignature(key, exp, signFsPath(key, exp))).toBe(false)
  })
  it('rejects a tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    const sig = signFsPath(key, exp)
    const tampered = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)
    expect(verifyFsSignature(key, exp, tampered)).toBe(false)
  })
})

describe('FsDriver round-trip', () => {
  it('puts, heads, reads, and deletes an object', async () => {
    const driver = new FsDriver()
    const key = buildStorageKey({
      tenantId: randomUUID(),
      entity: 'document',
      entityId: randomUUID(),
      contentType: 'application/pdf',
    })
    const bytes = Buffer.from('%PDF-1.4 test', 'utf8')

    await driver.putObject({ key, body: bytes, contentType: 'application/pdf' })

    const head = await driver.headObject(key)
    expect(head.exists).toBe(true)
    expect(head.size).toBe(bytes.length)
    expect(head.contentType).toBe('application/pdf')

    const read = await fsReadObject(key)
    expect(read.body.equals(bytes)).toBe(true)

    const dl = await driver.getSignedDownloadUrl({ key })
    const u = new URL('http://x' + dl.url)
    expect(verifyFsSignature(key, Number(u.searchParams.get('exp')), u.searchParams.get('sig') ?? '')).toBe(true)

    await driver.deleteObject(key)
    expect((await driver.headObject(key)).exists).toBe(false)
    // idempotent second delete
    await driver.deleteObject(key)
  })
})
