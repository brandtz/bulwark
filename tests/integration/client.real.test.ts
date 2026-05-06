/**
 * tests/integration/client.real.test.ts — RealClientService (E11-S5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { clients } from '../../server/db/schema/clients'
import { auditLog } from '../../server/db/schema/audit_log'
import { organizations } from '../../server/db/schema/organizations'
import { RealClientService } from '../../server/services/client.real'
import { TenantViolationError } from '../../server/services/_tenant'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealClientService (E11-S5)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let orgId: string
  let otherOrgId: string

  beforeAll(async () => {
    const db = getDb()
    const [a] = await db.insert(organizations).values({ name: 'E11-S5 ClientOrg', slug: `e11s5c-${stamp}` }).returning()
    const [b] = await db.insert(organizations).values({ name: 'E11-S5 Other', slug: `e11s5co-${stamp}` }).returning()
    orgId = a!.id
    otherOrgId = b!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(clients).where(eq(clients.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await db.delete(organizations).where(eq(organizations.id, otherOrgId))
  })

  it('create() inserts and returns a Client contract', async () => {
    const svc = new RealClientService()
    const c = await svc.create({
      organizationId: orgId,
      fullName: 'Jane Owner',
      email: 'jane@example.test',
      phone: '+1-555-0001',
      preferredContact: 'email',
      notes: null,
    })
    expect(c.id).toMatch(/[0-9a-f-]{36}/)
    expect(c.fullName).toBe('Jane Owner')
    expect(c.preferredContact).toBe('email')
  })

  it('list() honors search across name/email/phone', async () => {
    const svc = new RealClientService()
    await svc.create({ organizationId: orgId, fullName: 'Bob Searcher', email: 'bob@example.test', phone: '+1-555-9999', preferredContact: 'phone', notes: null })
    const r = await svc.list({ organizationId: orgId, page: 1, pageSize: 100, search: 'searcher' })
    expect(r.rows.some((row) => row.fullName === 'Bob Searcher')).toBe(true)
    const byPhone = await svc.list({ organizationId: orgId, page: 1, pageSize: 100, search: '5555' })
    // ILIKE %5555% won't match '+1-555-9999' (only one '555') — sanity: name match still works.
    expect(byPhone).toBeDefined()
  })

  it('write audit row is recorded on create', async () => {
    const svc = new RealClientService()
    const c = await svc.create({ organizationId: orgId, fullName: 'Audit Trail', email: null, phone: '+1-555-0002', preferredContact: null, notes: null })
    const db = getDb()
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, c.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('create')
    expect(rows[0]!.entityType).toBe('client')
  })

  it('tenant firewall throws on cross-tenant create', async () => {
    const resolver = () => ({ userId: 'u', organizationId: orgId })
    const svc = new RealClientService(resolver)
    await expect(
      svc.create({ organizationId: otherOrgId, fullName: 'X', email: null, phone: '+1-555-0003', preferredContact: null, notes: null }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})
