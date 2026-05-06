/**
 * server/jobs/boss.ts — pg-boss singleton wrapper (E11-S9).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - One PgBoss instance per process. Both the Nitro app (for
 *     publishing jobs from RealJobService.create()) and the Render
 *     background worker (for consuming) import this same module — the
 *     instance is constructed lazily on first call and `start()`-ed
 *     once.
 *   - pg-boss owns its own `pgboss` schema in the same Postgres
 *     database (ADR-0012). It auto-installs on first start. We do not
 *     need a separate Drizzle migration for it.
 *   - Queue names match `JobKind` values 1:1 so future kinds slot in
 *     without code changes here.
 *   - We construct PgBoss with the SAME DATABASE_URL the Drizzle
 *     client uses. Connection counts: pg-boss defaults to 10 — fine
 *     for v1; tune in S10 once Puppeteer is in flight.
 *
 * # Decision cast down
 *   - Rejected: a Nuxt plugin to start pg-boss in the web tier. The
 *     web tier only needs to PUBLISH; subscribing belongs to the
 *     worker. We expose `getBoss()` for both, but only the worker
 *     calls `boss.work()`.
 *   - Rejected: Drizzle-managed pg-boss schema. pg-boss handles its
 *     own schema migration internally; reimplementing in Drizzle
 *     would drift on every pg-boss upgrade.
 */
import { PgBoss } from 'pg-boss'

let _boss: PgBoss | null = null
let _starting: Promise<PgBoss> | null = null

export const QUEUE_COMPLIANCE_DOC = 'compliance_doc'

export const ALL_QUEUES = [QUEUE_COMPLIANCE_DOC] as const

/**
 * Lazily build + start a shared PgBoss instance. Idempotent — the first
 * caller eats the start latency; subsequent callers await the same
 * promise.
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss
  if (_starting) return _starting

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. pg-boss needs the same Postgres connection ' +
        'string as the Drizzle client (ADR-0012).',
    )
  }

  _starting = (async () => {
    const boss = new PgBoss({
      connectionString: url,
      // Keep a small connection budget; the worker process can scale
      // independently if we ever need more parallelism per job kind.
      max: 5,
    })
    boss.on('error', (err) => {
       
      console.error('[pg-boss] error', err)
    })
    await boss.start()
    // pg-boss v10+ requires queues to be explicitly registered before
    // send()/work() will accept them. Idempotent — safe on every boot.
    for (const q of ALL_QUEUES) {
      await boss.createQueue(q)
    }
    _boss = boss
    return boss
  })()

  return _starting
}

/** Test/teardown helper. Stops the boss and resets the singleton. */
export async function stopBoss(): Promise<void> {
  if (_boss) {
    await _boss.stop({ graceful: true })
    _boss = null
  }
  _starting = null
}
