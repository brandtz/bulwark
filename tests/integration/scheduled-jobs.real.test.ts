/**
 * tests/integration/scheduled-jobs.real.test.ts — L05-S1 handler coverage.
 *
 * Real-Postgres tests (auto-skip without DATABASE_URL) for the two
 * platform-scheduled JobKind handlers:
 *   - `account_purge` — hard-deletes only users past the 30-day grace
 *     window; idempotent second run.
 *   - `coi_expiry_scan` — walks every live org, flags only in-window COIs,
 *     reports per-org counts.
 * The handlers are called directly (no pg-boss) — queue transport is
 * covered by the worker's own retry policy and the L05-S2 e2e spec.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'
import {
  memberships,
  organizations,
  subcontractorCoiDocs,
  subcontractors,
  users,
} from '../../server/db/schema'
import { accountPurgeHandler } from '../../server/jobs/handlers/account-purge'
import { coiExpiryScanHandler } from '../../server/jobs/handlers/coi-expiry-scan'
import { PLATFORM_ORG_ID } from '../../shared/contracts/job'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

const DAY = 86_400_000
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function env(kind: 'account_purge' | 'coi_expiry_scan', payload: Record<string, unknown> = {}) {
  return {
    jobId: '00000000-0000-4000-8000-00000000dddd',
    organizationId: PLATFORM_ORG_ID,
    kind,
    payload,
  }
}

d('scheduled-job handlers (L05-S1)', () => {
  let orgId: string
  const userIds: string[] = []

  beforeAll(async () => {
    const db = getDb()
    const [org] = await db
      .insert(organizations)
      .values({ name: 'L05 Sched Org', slug: `l05-${suffix}` })
      .returning()
    orgId = org!.id
  })

  afterAll(async () => {
    const db = getDb()
    if (userIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.userId, userIds))
      await db.delete(users).where(inArray(users.id, userIds))
    }
    await db.delete(subcontractorCoiDocs).where(eq(subcontractorCoiDocs.organizationId, orgId))
    await db.delete(subcontractors).where(eq(subcontractors.organizationId, orgId))
    await db.delete(organizations).where(eq(organizations.id, orgId))
    await closeDb()
  })

  it('account_purge deletes only users past the grace window, idempotently', async () => {
    const db = getDb()
    const [expired] = await db
      .insert(users)
      .values({
        email: `purge-expired-${suffix}@test.local`,
        fullName: 'Past Grace',
        passwordHash: 'x',
        deletedAt: new Date(Date.now() - 31 * DAY),
      })
      .returning()
    const [inGrace] = await db
      .insert(users)
      .values({
        email: `purge-ingrace-${suffix}@test.local`,
        fullName: 'In Grace',
        passwordHash: 'x',
        deletedAt: new Date(Date.now() - 5 * DAY),
      })
      .returning()
    userIds.push(inGrace!.id) // expired one should be gone; clean the survivor

    const out = await accountPurgeHandler(env('account_purge'))
    expect(out?.summary).toBeDefined()
    const summary = out!.summary as { candidateCount: number; purgedCount: number }
    expect(summary.purgedCount).toBeGreaterThanOrEqual(1)

    const gone = await db.select().from(users).where(eq(users.id, expired!.id))
    expect(gone).toHaveLength(0)
    const kept = await db.select().from(users).where(eq(users.id, inGrace!.id))
    expect(kept).toHaveLength(1)

    // Idempotent: a second sweep finds nothing new for this fixture.
    const again = await accountPurgeHandler(env('account_purge'))
    const s2 = again!.summary as { purgedCount: number }
    expect(s2.purgedCount).toBe(0)
  })

  it('coi_expiry_scan flags only in-window COIs and reports per-org counts', async () => {
    const db = getDb()
    const [sub] = await db
      .insert(subcontractors)
      .values({
        organizationId: orgId,
        companyName: 'L05 Roofing LLC',
        contactName: 'Rita Roofer',
        email: `coi-${suffix}@test.local`,
        phone: '555-0100',
        trades: [],
      })
      .returning()

    await db.insert(subcontractorCoiDocs).values([
      {
        organizationId: orgId,
        subcontractorId: sub!.id,
        fileUrl: 'https://cdn.example.com/coi-expiring.pdf',
        fileName: 'coi-expiring.pdf',
        expiresAt: new Date(Date.now() + 10 * DAY), // inside 30-day window
      },
      {
        organizationId: orgId,
        subcontractorId: sub!.id,
        fileUrl: 'https://cdn.example.com/coi-fresh.pdf',
        fileName: 'coi-fresh.pdf',
        expiresAt: new Date(Date.now() + 200 * DAY), // well outside
      },
    ])

    const out = await coiExpiryScanHandler(env('coi_expiry_scan'))
    const summary = out!.summary as {
      scannedOrgs: number
      flagged: number
      failures: number
      byOrg: Array<{ organizationId: string; flagged: number }>
    }
    expect(summary.failures).toBe(0)
    expect(summary.scannedOrgs).toBeGreaterThanOrEqual(1)
    const mine = summary.byOrg.find((o) => o.organizationId === orgId)
    expect(mine?.flagged).toBe(1)
  })
})
