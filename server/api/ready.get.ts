/**
 * server/api/ready.get.ts — readiness probe (W3-5 / EH-Q / ADR-0034).
 *
 * Runs a tiny `SELECT 1` against the configured database to confirm
 * connectivity. Returns 503 if the DB is unreachable so an orchestrator
 * can stop routing traffic. No auth — the probe is public so external
 * uptime monitors and Kubernetes-style readiness checks work without
 * a service token. The endpoint reveals nothing beyond a boolean.
 */
import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { log } from '../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    return { ready: true }
  } catch (err) {
    log('error', 'readiness.check_failed', {
      requestId: event.context.requestId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    setResponseStatus(event, 503)
    return { ready: false }
  }
})
