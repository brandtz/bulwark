/**
 * tests/integration/announcements.real.test.ts — WP-X2 / ED-007 platform
 * announcements. `super_admin` is an organization role (org owners hold it),
 * so writes must additionally require a platform operator
 * (BULWARK_PLATFORM_ADMIN_EMAILS); otherwise any tenant could broadcast to all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { announcementDismissals, platformAnnouncements, users } from '../../server/db/schema'
import { platformOperatorEmails, RealAnnouncementService } from '../../server/services/announcement.real'
import { MockAnnouncementService } from '../../shared/mocks/announcement.mock'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

describe('platformOperatorEmails', () => {
  it('parses a trimmed, case-insensitive comma list; unset means nobody', () => {
    expect([...platformOperatorEmails({})]).toEqual([])
    expect([...platformOperatorEmails({ BULWARK_PLATFORM_ADMIN_EMAILS: ' Ops@Bulwark.app, ,b@x.test ' })]).toEqual(['ops@bulwark.app', 'b@x.test'])
  })
})

describe('MockAnnouncementService', () => {
  it('refuses writes and the admin list (no platform operators in the mock lane)', async () => {
    const svc = new MockAnnouncementService(() => ({ organizationId: 'o', userId: 'u' }))
    await expect(svc.upsert({ title: 't', body: 'b', tone: 'info' })).rejects.toThrow(/platform operators only/)
    await expect(svc.list()).rejects.toThrow(/platform operators only/)
    await expect(svc.remove('x')).rejects.toThrow(/platform operators only/)
  })

  it('requires a session to read', async () => {
    await expect(new MockAnnouncementService(() => null).listActive()).rejects.toThrow(/Authentication required/)
  })
})

d('RealAnnouncementService (WP-X2 / ED-007)', () => {
  let operatorId: string
  let orgOwnerId: string
  let operatorEmail: string
  const created: string[] = []
  let saved: string | undefined

  beforeAll(async () => {
    const db = getDb()
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const hash = await bcrypt.hash('x', 4)
    operatorEmail = `ops-${stamp}@x.test`
    const [op] = await db.insert(users).values({ email: operatorEmail, fullName: 'Ops', passwordHash: hash, isActive: true }).returning()
    const [owner] = await db.insert(users).values({ email: `owner-${stamp}@x.test`, fullName: 'Owner', passwordHash: hash, isActive: true }).returning()
    operatorId = op!.id
    orgOwnerId = owner!.id
    saved = process.env.BULWARK_PLATFORM_ADMIN_EMAILS
    process.env.BULWARK_PLATFORM_ADMIN_EMAILS = operatorEmail.toUpperCase()
  })

  afterAll(async () => {
    if (saved === undefined) Reflect.deleteProperty(process.env, 'BULWARK_PLATFORM_ADMIN_EMAILS')
    else process.env.BULWARK_PLATFORM_ADMIN_EMAILS = saved
    const db = getDb()
    if (created.length) {
      await db.delete(announcementDismissals).where(inArray(announcementDismissals.announcementId, created))
      await db.delete(platformAnnouncements).where(inArray(platformAnnouncements.id, created))
    }
    await db.delete(users).where(inArray(users.id, [operatorId, orgOwnerId]))
  })

  const as = (userId: string) => new RealAnnouncementService(() => ({ organizationId: '00000000-0000-0000-0000-000000000000', userId }))

  it('an org owner (super_admin membership) cannot create, list or remove announcements', async () => {
    await expect(as(orgOwnerId).upsert({ title: 'Phish', body: 'Log in at evil.example', tone: 'warning' })).rejects.toThrow(/platform operators only/)
    await expect(as(orgOwnerId).list()).rejects.toThrow(/platform operators only/)
    const rows = await getDb().select().from(platformAnnouncements).where(eq(platformAnnouncements.title, 'Phish'))
    expect(rows).toHaveLength(0)
  })

  it('nobody can write when the allowlist is unset', async () => {
    const env = process.env.BULWARK_PLATFORM_ADMIN_EMAILS
    Reflect.deleteProperty(process.env, 'BULWARK_PLATFORM_ADMIN_EMAILS')
    try {
      await expect(as(operatorId).upsert({ title: 't', body: 'b', tone: 'info' })).rejects.toThrow(/platform operators only/)
    } finally {
      process.env.BULWARK_PLATFORM_ADMIN_EMAILS = env
    }
  })

  it('a platform operator creates one; members see it until they dismiss; others cannot remove it', async () => {
    const a = await as(operatorId).upsert({ title: `Maintenance ${Date.now()}`, body: 'Tonight 22:00', tone: 'info' })
    created.push(a.id)
    expect((await as(orgOwnerId).listActive()).map((r) => r.id)).toContain(a.id)
    await as(orgOwnerId).dismiss(a.id)
    expect((await as(orgOwnerId).listActive()).map((r) => r.id)).not.toContain(a.id)
    await expect(as(orgOwnerId).remove(a.id)).rejects.toThrow(/platform operators only/)
    await as(operatorId).remove(a.id)
    expect((await as(operatorId).list()).map((r) => r.id)).not.toContain(a.id)
  })
})
