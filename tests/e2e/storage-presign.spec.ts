/**
 * tests/e2e/storage-presign.spec.ts — L01-S2 / WP-L02 presign + finalize over
 * HTTP, on whichever storage driver the server runs (fs on nuxt dev; R2 against
 * an S3 stand-in on the built server in CI). Presigned URLs are relative on fs
 * and absolute on R2; both are followed as returned.
 *
 * Covers: 401/403/400 on presign, the upload → finalize → download round trip,
 * oversize rejection at finalize, and the ED-059 staging-key rules (finalize is
 * single-use and bound to the uploader; a staged key cannot be persisted; a
 * re-PUT to the staged URL after finalize cannot change the persisted object).
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { signIn, signOut } from './_helpers'

const BASE = 'http://localhost:3000'
const abs = (url: string) => (url.startsWith('http') ? url : `${BASE}${url}`)

async function orgOf(request: APIRequestContext): Promise<string> {
  const me = await request.post(`${BASE}/api/services/auth/currentUser`)
  expect(me.ok()).toBeTruthy()
  return (await me.json()).activeOrganizationId as string
}

async function presign(request: APIRequestContext, data: Record<string, unknown>) {
  return request.post(`${BASE}/api/storage/presign-upload`, { data })
}

async function upload(request: APIRequestContext, org: string, bytes: Buffer, opts: { entity?: string, contentType?: string, entityId?: string } = {}) {
  const contentType = opts.contentType ?? 'image/png'
  const up = await presign(request, { organizationId: org, entity: opts.entity ?? 'property_photo', entityId: opts.entityId ?? randomUUID(), contentType, sizeBytes: bytes.length })
  expect(up.ok(), await up.text()).toBeTruthy()
  const { key, url } = (await up.json()) as { key: string, url: string }
  const put = await request.put(abs(url), { data: bytes, headers: { 'content-type': contentType } })
  expect(put.ok(), `PUT ${put.status()} ${await put.text()}`).toBeTruthy()
  return { key, url, contentType }
}

async function download(request: APIRequestContext, org: string, key: string) {
  const dl = await request.post(`${BASE}/api/storage/presign-download`, { data: { organizationId: org, key } })
  expect(dl.ok(), await dl.text()).toBeTruthy()
  return request.get(abs((await dl.json()).url as string))
}

test.describe('storage presign + finalize', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'HTTP-level; checked once')
  test.skip(process.env.BULWARK_BACKEND === 'mock', 'storage endpoints are real-backend only')

  test('rejects an unauthenticated upload presign with 401', async ({ context }) => {
    await signOut(context)
    const res = await presign(context.request, { organizationId: randomUUID(), entity: 'property_photo', entityId: randomUUID(), contentType: 'image/jpeg', sizeBytes: 1024 })
    expect(res.status()).toBe(401)
  })

  test('round-trips an upload and enforces the firewall, MIME and role rules', async ({ context, browser }) => {
    await signIn(context, 'drew@bulwark.demo')
    const org = await orgOf(context.request)

    const crossTenant = await presign(context.request, { organizationId: randomUUID(), entity: 'property_photo', entityId: randomUUID(), contentType: 'image/jpeg', sizeBytes: 1024 })
    expect(crossTenant.status()).toBe(403)
    const badMime = await presign(context.request, { organizationId: org, entity: 'document', entityId: randomUUID(), contentType: 'image/png', sizeBytes: 1024 })
    expect(badMime.status()).toBe(400)

    const bytes = Buffer.from([1, 2, 3, 4, 5])
    const { key } = await upload(context.request, org, bytes)
    const fin = await context.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key } })
    expect(fin.ok(), await fin.text()).toBeTruthy()
    const finalized = await fin.json() as { key: string, size: number }
    expect(finalized.size).toBe(bytes.length)
    expect(finalized.key).not.toBe(key)
    const got = await download(context.request, org, finalized.key)
    expect(got.ok()).toBeTruthy()
    expect(Buffer.from(await got.body())).toEqual(bytes)

    // Field staff may not stage a branding logo (mirrors the owning service).
    const field = await browser.newContext()
    try {
      await signIn(field, 'matthew@bulwark.demo')
      const denied = await presign(field.request, { organizationId: org, entity: 'branding_logo', entityId: org, contentType: 'image/png', sizeBytes: 10 })
      expect(denied.status()).toBe(403)
    } finally {
      await field.close()
    }
  })

  test('finalize rejects an oversize upload and deletes the object', async ({ context }) => {
    await signIn(context, 'drew@bulwark.demo')
    const org = await orgOf(context.request)
    // avatar cap is 2 MB; presign declares a tiny size, then the PUT exceeds the cap.
    const up = await presign(context.request, { organizationId: org, entity: 'avatar', entityId: randomUUID(), contentType: 'image/png', sizeBytes: 5 })
    expect(up.ok()).toBeTruthy()
    const { key, url } = (await up.json()) as { key: string, url: string }
    const big = Buffer.alloc(2 * 1024 * 1024 + 16, 7)
    const put = await context.request.put(abs(url), { data: big, headers: { 'content-type': 'image/png' } })
    expect(put.ok(), `PUT ${put.status()} ${await put.text()}`).toBeTruthy()
    const fin = await context.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key } })
    expect(fin.status()).toBe(400)
    // Neither the staged nor any finalized copy survives.
    expect((await download(context.request, org, key)).status()).toBe(404)
  })

  test('staging keys (ED-059): single-use, bound to the uploader, never persistable, immune to re-PUT', async ({ context, browser }) => {
    await signIn(context, 'drew@bulwark.demo')
    const org = await orgOf(context.request)
    const propertyId = ((await (await context.request.post(`${BASE}/api/services/property/list`, { data: { args: [{ organizationId: org, page: 1, pageSize: 1 }] } })).json()) as { rows: Array<{ id: string }> }).rows[0]!.id

    // Another member cannot finalize my staged upload (and so cannot delete it).
    const mine = await upload(context.request, org, Buffer.from('mine'), { entityId: propertyId })
    const other = await browser.newContext()
    try {
      await signIn(other, 'morgan@bulwark.demo')
      const stolen = await other.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key: mine.key } })
      expect(stolen.status()).toBe(403)
    } finally {
      await other.close()
    }

    // A staged key cannot be persisted without finalize.
    const skip = await context.request.post(`${BASE}/api/services/propertyPhoto/create`, {
      data: { args: [{ organizationId: org, propertyId, url: mine.key, caption: 'skip finalize' }] },
    })
    expect(skip.status()).toBe(400)
    expect(await skip.text()).toContain('finalize the upload first')

    const fin = await context.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key: mine.key } })
    expect(fin.ok(), await fin.text()).toBeTruthy()
    const finalKey = (await fin.json()).key as string

    // Replaying finalize, or finalizing the persisted key, is refused and deletes nothing.
    const replay = await context.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key: mine.key } })
    expect([400, 404]).toContain(replay.status())
    const onFinal = await context.request.post(`${BASE}/api/storage/finalize-upload`, { data: { organizationId: org, key: finalKey } })
    expect(onFinal.status()).toBe(400)

    // A re-PUT to the still-live staged URL cannot change the persisted object.
    await context.request.put(abs(mine.url), { data: Buffer.from('evil'), headers: { 'content-type': mine.contentType } })
    const got = await download(context.request, org, finalKey)
    expect(got.ok()).toBeTruthy()
    expect(Buffer.from(await got.body()).toString()).toBe('mine')
  })
})
