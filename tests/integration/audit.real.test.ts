/**
 * tests/integration/audit.real.test.ts — RealAuditService + withAudit (E11-S2).
 *
 * # Decisions (ADR-0007 carve-out)
 *   - These tests need a real Postgres. We auto-skip when DATABASE_URL
 *     isn't set so CI without DB stays green; locally + on the
 *     "real backend" CI lane they run.
 *   - Each test fabricates a fresh organization (with a unique slug)
 *     and tears down via `ON DELETE CASCADE`-friendly cleanup at the
 *     end. We never share state across tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'
import { auditLog, organizations } from '../../server/db/schema'
import { RealAuditService } from '../../server/services/audit.real'
import { withAudit } from '../../server/services/_tx'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('RealAuditService + withAudit (E11-S2)', () => {
  let orgId: string

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db
      .insert(organizations)
      .values({ name: 'E11-S2 Test Org', slug: `e11s2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
      .returning()
    orgId = org!.id
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(auditLog).where(eq(auditLog.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await closeDb()
  })

  it('record() inserts and returns the row', async () => {
    const audit = new RealAuditService()
    const row = await audit.record({
      organizationId: orgId,
      entityType: 'property',
      entityId: '00000000-0000-4000-8000-000000000001',
      action: 'create',
      actorUserId: null,
      metadata: { reason: 'unit-test' },
      after: { status: 'lead' },
    })
    expect(row.id).toMatch(/[0-9a-f-]{36}/)
    expect(row.entityType).toBe('property')
    expect(row.action).toBe('create')
    expect(row.metadata).toEqual({ reason: 'unit-test' })
    expect(row.after).toEqual({ status: 'lead' })
    expect(row.before).toBeNull()
  })

  it('list() returns rows newest-first, scoped to org', async () => {
    const audit = new RealAuditService()
    const eid = '00000000-0000-4000-8000-000000000002'
    await audit.record({ organizationId: orgId, entityType: 'quote', entityId: eid, action: 'create', actorUserId: null })
    await audit.record({ organizationId: orgId, entityType: 'quote', entityId: eid, action: 'state_change', actorUserId: null, metadata: { from: 'draft', to: 'sent' } })

    const rows = await audit.list({ organizationId: orgId, entityType: 'quote', entityId: eid, limit: 10 })
    expect(rows).toHaveLength(2)
    expect(rows[0]!.action).toBe('state_change')
    expect(rows[1]!.action).toBe('create')
  })

  it('withAudit() commits domain write + audit row atomically', async () => {
    const newSlug = `e11s2-tx-${Date.now()}`
    const result = await withAudit(async ({ tx, audit }) => {
      const [createdOrg] = await tx
        .insert(organizations)
        .values({ name: 'TX Test Org', slug: newSlug })
        .returning()
      await audit.record({
        organizationId: createdOrg!.id,
        entityType: 'organization',
        entityId: createdOrg!.id,
        action: 'create',
        actorUserId: null,
        after: { name: createdOrg!.name },
      })
      return createdOrg!
    })

    const db = getDb()
    const found = await db.select().from(organizations).where(eq(organizations.id, result.id))
    expect(found).toHaveLength(1)
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.organizationId, result.id))
    expect(auditRows).toHaveLength(1)

    // Cleanup the tx-created org and its audit rows.
    await db.delete(auditLog).where(eq(auditLog.organizationId, result.id))
    await db.delete(organizations).where(eq(organizations.id, result.id))
  })

  it('withAudit() rolls back BOTH on handler throw', async () => {
    const beforeCount = (await getDb().select().from(auditLog).where(eq(auditLog.organizationId, orgId))).length
    const slug = `e11s2-rollback-${Date.now()}`

    await expect(
      withAudit(async ({ tx, audit }) => {
        await tx.insert(organizations).values({ name: 'Rollback Org', slug }).returning()
        await audit.record({
          organizationId: orgId,
          entityType: 'organization',
          entityId: '00000000-0000-4000-8000-000000000003',
          action: 'create',
          actorUserId: null,
        })
        throw new Error('intentional rollback')
      }),
    ).rejects.toThrow('intentional rollback')

    const db = getDb()
    const orgsAfter = await db.select().from(organizations).where(eq(organizations.slug, slug))
    expect(orgsAfter).toHaveLength(0)
    const afterCount = (await db.select().from(auditLog).where(eq(auditLog.organizationId, orgId))).length
    expect(afterCount).toBe(beforeCount)
  })
})
