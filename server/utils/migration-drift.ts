/**
 * server/utils/migration-drift.ts — is the database migrated as far as this
 * build expects? (WP-L08 S2.)
 *
 * The build bundles drizzle's migration journal; drizzle-kit records each
 * applied migration in `drizzle.__drizzle_migrations` with `created_at` = the
 * journal entry's `when`. The DB is current when its newest recorded
 * migration is at least as new as the newest journal entry. A DB that is
 * AHEAD of the code (a rollback deploy) is fine; BEHIND is not — the code may
 * query tables or columns that do not exist yet (the L06 counter table was the
 * motivating case: its migration must land before its code).
 */
import { sql } from 'drizzle-orm'
import journal from '../db/migrations/meta/_journal.json'
import type { getDb } from '../db/client'

export interface MigrationStatus {
  ok: boolean
  /** Tag of the newest migration this build ships. */
  expected: string
  /** Newest applied migration timestamp in the DB, or null if none recorded. */
  appliedWhen: number | null
}

export function expectedMigration(): { tag: string, when: number } {
  const entries = (journal as { entries: Array<{ tag: string, when: number }> }).entries
  const last = entries[entries.length - 1]
  if (!last) throw new Error('migration journal is empty')
  return { tag: last.tag, when: last.when }
}

export async function checkMigrations(db: Pick<ReturnType<typeof getDb>, 'execute'>): Promise<MigrationStatus> {
  const expected = expectedMigration()
  const rows = await db.execute(sql`SELECT max(created_at)::bigint AS applied FROM drizzle.__drizzle_migrations`) as unknown as Array<{ applied: string | number | null }>
  const raw = rows[0]?.applied
  const appliedWhen = raw === null || raw === undefined ? null : Number(raw)
  return { ok: appliedWhen !== null && appliedWhen >= expected.when, expected: expected.tag, appliedWhen }
}
