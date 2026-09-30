/**
 * tests/integration/migration-drift.real.test.ts — WP-L08 S2 against Postgres.
 *
 * The unit test mocks `execute`; this runs the real query against
 * drizzle.__drizzle_migrations. A migrated DB is current. Removing the newest
 * bookkeeping row (inside a rolled-back transaction) makes it "behind", which is
 * what turns /api/ready into a 503.
 */
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb } from '../../server/db/client'
import { checkMigrations, expectedMigration } from '../../server/utils/migration-drift'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

class Rollback extends Error {}

d('migration drift on the real bookkeeping table (WP-L08 S2)', () => {
  it('a migrated database is current', async () => {
    const status = await checkMigrations(getDb())
    expect(status).toMatchObject({ ok: true, expected: expectedMigration().tag })
    expect(status.appliedWhen).toBeGreaterThanOrEqual(expectedMigration().when)
  })

  it('a database missing the newest migration is behind', async () => {
    let behind: Awaited<ReturnType<typeof checkMigrations>> | undefined
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= ${expectedMigration().when}`)
      behind = await checkMigrations(tx)
      throw new Rollback()
    }).catch((e: unknown) => { if (!(e instanceof Rollback)) throw e })
    expect(behind).toMatchObject({ ok: false })
    expect(behind!.appliedWhen === null || behind!.appliedWhen < expectedMigration().when).toBe(true)
    // Rolled back: still current afterwards.
    await expect(checkMigrations(getDb())).resolves.toMatchObject({ ok: true })
  })
})
