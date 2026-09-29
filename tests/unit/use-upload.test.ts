/**
 * tests/unit/use-upload.test.ts — WP-L02 client upload flow (uploadAsset):
 * presign → PUT bytes to the returned URL with the returned headers →
 * finalize the staged key → hand back the FINALIZED key. Failures stop the
 * flow before finalize, so nothing unverified is ever persisted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadAsset } from '../../app/composables/useUpload'

const ORG = '00000000-0000-4000-8000-000000000001'
const staged = `${ORG}/property_photo/${ORG}/s-11111111-1111-4111-8111-111111111111-0123456789abcdef.png`
const finalKey = `${ORG}/property_photo/${ORG}/22222222-2222-4222-8222-222222222222.png`

function stub(opts: { putStatus?: number } = {}) {
  const calls: string[] = []
  const $fetch = vi.fn(async (url: string, init: { body: Record<string, unknown> }) => {
    calls.push(url)
    if (url === '/api/storage/presign-upload') return { key: staged, url: 'https://r2.example/put?sig=1', method: 'PUT', headers: { 'content-type': 'image/png' } }
    if (url === '/api/storage/finalize-upload') {
      expect(init.body).toEqual({ organizationId: ORG, key: staged })
      return { key: finalKey, size: 3, contentType: 'image/png' }
    }
    throw new Error(`unexpected ${url}`)
  })
  const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
    calls.push(`PUT ${url}`)
    return { ok: (opts.putStatus ?? 200) < 300, status: opts.putStatus ?? 200 }
  })
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('fetch', fetchFn)
  return { calls, $fetch, fetchFn }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadAsset (WP-L02)', () => {
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

  it('presigns, PUTs with the presigned headers, finalizes, and returns the finalized key', async () => {
    const { calls, $fetch, fetchFn } = stub()
    const out = await uploadAsset({ organizationId: ORG, entity: 'property_photo', entityId: ORG, file })
    expect(calls).toEqual(['/api/storage/presign-upload', 'PUT https://r2.example/put?sig=1', '/api/storage/finalize-upload'])
    expect($fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { organizationId: ORG, entity: 'property_photo', entityId: ORG, contentType: 'image/png', sizeBytes: 3 } })
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/png' }, body: file })
    expect(out.key).toBe(finalKey)
    expect(out.key).not.toBe(staged)
  })

  it('does not finalize when the PUT fails', async () => {
    const { calls } = stub({ putStatus: 403 })
    await expect(uploadAsset({ organizationId: ORG, entity: 'property_photo', entityId: ORG, file })).rejects.toThrow(/Upload failed \(403\)/u)
    expect(calls).not.toContain('/api/storage/finalize-upload')
  })

  it('refuses a Blob without a content type before any request', async () => {
    const { calls } = stub()
    await expect(uploadAsset({ organizationId: ORG, entity: 'property_photo', entityId: ORG, file: new Blob([new Uint8Array([1])]) })).rejects.toThrow(/unknown content type/u)
    expect(calls).toEqual([])
  })

  it('surfaces a presign rejection and never PUTs', async () => {
    const { calls, $fetch } = stub()
    $fetch.mockImplementationOnce(async () => { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) })
    await expect(uploadAsset({ organizationId: ORG, entity: 'branding_logo', entityId: ORG, file })).rejects.toThrow(/Forbidden/u)
    expect(calls.some((c) => c.startsWith('PUT'))).toBe(false)
  })
})
