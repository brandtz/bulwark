/**
 * tests/integration/push.real.test.ts — WP-X3 Web Push (ED-016).
 *
 * - The VAPID JWT verifies against the public key, as a push service checks it.
 * - Payload-less POST with the vapid authorization header.
 * - subscribe / rebind / list / unsubscribe are self-scoped; a 410 from the
 *   push service revokes the subscription.
 * - Push is disabled without VAPID keys.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { memberships, organizations, pushSubscriptions, users } from '../../server/db/schema'
import { buildVapidJwt, sendPush, sendPushToUser, vapidConfig } from '../../server/services/_providers/push'
import { RealPushService } from '../../server/services/push.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pub = publicKey.export({ format: 'jwk' }) as { x: string, y: string }
  const priv = privateKey.export({ format: 'jwk' }) as { d: string }
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')])
  return { publicKey: raw.toString('base64url'), privateKey: priv.d, subject: 'mailto:ops@example.com' }
}

describe('VAPID (WP-X3)', () => {
  it('signs an ES256 JWT that verifies with the public key', () => {
    const cfg = vapidKeys()
    const jwt = buildVapidJwt('https://fcm.googleapis.com', cfg, Date.UTC(2026, 8, 28))
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString())
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:ops@example.com', exp: Date.UTC(2026, 8, 28) / 1000 + 12 * 3600 })
    const raw = Buffer.from(cfg.publicKey, 'base64url')
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } })
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))).toBe(true)
  })

  it('sends a payload-less POST with the vapid authorization header', async () => {
    const cfg = vapidKeys()
    const fetcher = vi.fn().mockResolvedValue({ status: 201 })
    expect(await sendPush('https://push.example.com/send/abc', cfg, fetcher)).toBe(201)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://push.example.com/send/abc')
    expect(init.method).toBe('POST')
    expect(init.headers['content-length']).toBe('0')
    expect(init.headers.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${cfg.publicKey}$`, 'u'))
  })

  it('is disabled without keys', () => {
    expect(vapidConfig({})).toBeNull()
    expect(vapidConfig({ VAPID_PUBLIC_KEY: 'a' })).toBeNull()
  })
})

d('push subscriptions (WP-X3)', () => {
  let orgId: string
  let userId: string
  let otherId: string
  const saved: Record<string, string | undefined> = {}

  beforeAll(async () => {
    const cfg = vapidKeys()
    for (const [k, v] of Object.entries({ VAPID_PUBLIC_KEY: cfg.publicKey, VAPID_PRIVATE_KEY: cfg.privateKey })) {
      saved[k] = process.env[k]
      process.env[k] = v
    }
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const [o] = await db.insert(organizations).values({ name: 'X3 push', slug: `x3-push-${stamp}` }).returning()
    orgId = o!.id
    const hash = await bcrypt.hash('x', 4)
    const [u] = await db.insert(users).values({ email: `x3-push-${stamp}@x.test`, fullName: 'P', passwordHash: hash, isActive: true }).returning()
    const [u2] = await db.insert(users).values({ email: `x3-push2-${stamp}@x.test`, fullName: 'Q', passwordHash: hash, isActive: true }).returning()
    userId = u!.id
    otherId = u2!.id
    await db.insert(memberships).values([{ userId, organizationId: orgId, role: 'field' }, { userId: otherId, organizationId: orgId, role: 'field' }])
  })

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k)
      else process.env[k] = v
    }
    const db = getDb()
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.organizationId, orgId))
    await db.delete(memberships).where(eq(memberships.organizationId, orgId))
    await db.delete(users).where(inArray(users.id, [userId, otherId]))
    await db.delete(organizations).where(eq(organizations.id, orgId))
  })

  const as = (id: string) => new RealPushService(() => ({ organizationId: orgId, userId: id }))
  const sub = (n: number) => ({ organizationId: orgId, endpoint: `https://push.example.com/send/${orgId}-${n}`, keys: { p256dh: 'BPk', auth: 'au' } })

  it('subscribes, lists and unsubscribes only the caller\'s devices', async () => {
    const svc = as(userId)
    expect((await svc.config(orgId)).enabled).toBe(true)
    await svc.subscribe(sub(1))
    await svc.subscribe(sub(2))
    expect(await svc.listMine(orgId)).toHaveLength(2)
    expect(await as(otherId).listMine(orgId)).toHaveLength(0)
    await as(otherId).unsubscribe({ organizationId: orgId, endpoint: sub(1).endpoint }) // not theirs: no effect
    expect(await svc.listMine(orgId)).toHaveLength(2)
    await svc.unsubscribe({ organizationId: orgId, endpoint: sub(1).endpoint })
    expect(await svc.listMine(orgId)).toHaveLength(1)
  })

  it('re-subscribing an endpoint rebinds it (device changed hands) and rejects non-https', async () => {
    await as(otherId).subscribe(sub(2))
    expect(await as(userId).listMine(orgId)).toHaveLength(0)
    expect(await as(otherId).listMine(orgId)).toHaveLength(1)
    await expect(as(userId).subscribe({ ...sub(3), endpoint: 'http://push.example.com/x' })).rejects.toThrow(/^Invalid push subscription/)
  })

  it('a 410 from the push service revokes the subscription', async () => {
    await as(userId).subscribe(sub(4))
    await as(userId).subscribe(sub(5))
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({ status: url.endsWith('-4') ? 410 : 201 }))
    await expect(sendPushToUser(orgId, userId, fetcher)).resolves.toEqual({ sent: 1, revoked: 1, failed: 0 })
    expect((await as(userId).listMine(orgId)).length).toBe(1)
  })
})
