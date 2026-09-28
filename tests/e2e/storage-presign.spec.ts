/**
 * tests/e2e/storage-presign.spec.ts — L01-S2 presign endpoints (real backend).
 *
 * Exercises the HTTP surface end-to-end against the filesystem storage driver:
 * 401 when unauthenticated, 403 cross-tenant, 400 on a bad MIME, and a full
 * presign-upload → PUT → presign-download → GET round-trip.
 */
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { isBuiltServer, signIn, signOut } from './_helpers'

const BASE = 'http://localhost:3000'

test.describe('storage presign', () => {
  // These specs drive the filesystem dev driver (/api/_dev/uploads). A production build
  // compiles those routes out while local runs have no R2, so they only run on nuxt dev.
  test.skip(isBuiltServer(), 'filesystem dev storage routes are not in production builds')

  test('rejects an unauthenticated upload presign with 401', async ({ context }) => {
    await signOut(context)
    const res = await context.request.post(`${BASE}/api/storage/presign-upload`, {
      data: {
        organizationId: randomUUID(),
        entity: 'property_photo',
        entityId: randomUUID(),
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      },
    })
    expect(res.status()).toBe(401)
  })

  test('round-trips an upload and enforces the firewall + validation', async ({ context }) => {
    await signIn(context, 'drew@bulwark.demo')

    const me = await context.request.post(`${BASE}/api/services/auth/currentUser`)
    expect(me.ok()).toBeTruthy()
    const org = (await me.json()).activeOrganizationId as string

    // cross-tenant organizationId → 403
    const crossTenant = await context.request.post(`${BASE}/api/storage/presign-upload`, {
      data: {
        organizationId: randomUUID(),
        entity: 'property_photo',
        entityId: randomUUID(),
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      },
    })
    expect(crossTenant.status()).toBe(403)

    // disallowed MIME for the entity → 400
    const badMime = await context.request.post(`${BASE}/api/storage/presign-upload`, {
      data: {
        organizationId: org,
        entity: 'document',
        entityId: randomUUID(),
        contentType: 'image/png',
        sizeBytes: 1024,
      },
    })
    expect(badMime.status()).toBe(400)

    // happy upload presign
    const up = await context.request.post(`${BASE}/api/storage/presign-upload`, {
      data: {
        organizationId: org,
        entity: 'property_photo',
        entityId: randomUUID(),
        contentType: 'image/png',
        sizeBytes: 5,
      },
    })
    expect(up.ok()).toBeTruthy()
    const { key, url } = (await up.json()) as { key: string; url: string }
    expect(typeof key).toBe('string')

    // PUT bytes to the signed (fs dev) URL
    const bytes = Buffer.from([1, 2, 3, 4, 5])
    const put = await context.request.put(`${BASE}${url}`, {
      data: bytes,
      headers: { 'content-type': 'image/png' },
    })
    expect(put.ok(), `PUT ${put.status()} ${await put.text()}`).toBeTruthy()

    // finalize: server HEADs the object and enforces the real size/content-type
    const fin = await context.request.post(`${BASE}/api/storage/finalize-upload`, {
      data: { organizationId: org, key },
    })
    expect(fin.ok()).toBeTruthy()
    expect((await fin.json()).size).toBe(bytes.length)

    // download presign + GET returns the same bytes
    const dl = await context.request.post(`${BASE}/api/storage/presign-download`, {
      data: { organizationId: org, key },
    })
    expect(dl.ok()).toBeTruthy()
    const dlUrl = (await dl.json()).url as string
    const got = await context.request.get(`${BASE}${dlUrl}`)
    expect(got.ok()).toBeTruthy()
    expect(Buffer.from(await got.body())).toEqual(bytes)
  })

  test('finalize rejects an oversize upload and deletes the object', async ({ context }) => {
    await signIn(context, 'drew@bulwark.demo')
    const me = await context.request.post(`${BASE}/api/services/auth/currentUser`)
    const org = (await me.json()).activeOrganizationId as string

    // avatar cap is 2 MB; presign declares a tiny size, then PUT exceeds the cap.
    const up = await context.request.post(`${BASE}/api/storage/presign-upload`, {
      data: { organizationId: org, entity: 'avatar', entityId: randomUUID(), contentType: 'image/png', sizeBytes: 5 },
    })
    expect(up.ok()).toBeTruthy()
    const { key, url } = (await up.json()) as { key: string; url: string }

    const big = Buffer.alloc(2 * 1024 * 1024 + 16, 7)
    const put = await context.request.put(`${BASE}${url}`, { data: big, headers: { 'content-type': 'image/png' } })
    expect(put.ok(), `PUT ${put.status()} ${await put.text()}`).toBeTruthy()

    const fin = await context.request.post(`${BASE}/api/storage/finalize-upload`, {
      data: { organizationId: org, key },
    })
    expect(fin.status()).toBe(400)

    // the object was deleted, so a fresh download GET 404s
    const dl = await context.request.post(`${BASE}/api/storage/presign-download`, {
      data: { organizationId: org, key },
    })
    expect(dl.ok()).toBeTruthy()
    const got = await context.request.get(`${BASE}${(await dl.json()).url}`)
    expect(got.status()).toBe(404)
  })
})
