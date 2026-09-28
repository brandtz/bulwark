/**
 * server/api/ready.get.ts — readiness probe (W3-5 / EH-Q / ADR-0034;
 * migration drift WP-L08 S2).
 *
 * Confirms DB connectivity AND that the database is migrated at least as far
 * as this build expects. Returns 503 when the DB is unreachable or behind, so
 * an orchestrator / uptime monitor stops treating the deploy as healthy. No
 * auth — external monitors need it — so the body carries only booleans.
 */
import { evaluateProductionEnv, runtimeGuardEnv } from '../utils/env-guard'
import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { log } from '../utils/logger'
import { checkMigrations } from '../utils/migration-drift'

export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    const migrations = await checkMigrations(db)
    if (!migrations.ok) {
      log('error', 'readiness.migrations_behind', {
        requestId: event.context.requestId,
        expected: migrations.expected,
        appliedWhen: migrations.appliedWhen,
      })
      setResponseStatus(event, 503)
    }
    return {
      ready: migrations.ok,
      migrationsOk: migrations.ok,
      // WP-L07 S4: flag unsafe production config without disclosing which setting.
      configOk: evaluateProductionEnv(runtimeGuardEnv()).critical.length === 0,
    }
  } catch (err) {
    log('error', 'readiness.check_failed', {
      requestId: event.context.requestId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    setResponseStatus(event, 503)
    return { ready: false }
  }
})
