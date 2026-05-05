/**
 * server/services/_tx.ts — transaction helper (E11-S2).
 *
 * # Decisions (ADR-0002, ADR-0008)
 *   - One canonical entry point for "do a domain write AND record an
 *     audit row in a single atomic transaction." Every Real* service
 *     mutation routes through this — non-negotiable per ADR-0002.
 *   - The handler receives a tx-bound `RealAuditService` so it can
 *     issue `audit.record(...)` inline without juggling tx handles.
 *   - The handler must return the post-write entity (or void); the
 *     helper threads the return through unchanged.
 *
 * # Decision cast down
 *   - Rejected: a decorator-style `@audited` annotation. Hides the
 *     audit ceremony at the cost of grep-ability. Explicit beats
 *     magical when a regulator asks "where does this row come from."
 *   - Rejected: an event-bus pattern. Decouples writes from audit
 *     in time, which is exactly the property we DON'T want — the
 *     audit row must commit or roll back with the source write.
 */
import { getDb } from '../db/client'
import { RealAuditService } from './audit.real'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface AuditCtx {
  audit: RealAuditService
  tx: Tx
}

/**
 * Open a transaction and provide a tx-bound audit service to the handler.
 * The handler's returned value is propagated to the caller. Any throw
 * inside the handler rolls back BOTH the domain write and the audit row.
 *
 * Usage:
 *   return withAudit(async ({ tx, audit }) => {
 *     const [row] = await tx.insert(properties).values(...).returning()
 *     await audit.record({ ... })
 *     return rowToContract(row)
 *   })
 */
export async function withAudit<T>(
  handler: (ctx: AuditCtx) => Promise<T>,
  db: Db = getDb(),
): Promise<T> {
  return db.transaction(async (tx) => {
    const audit = new RealAuditService(tx as unknown as Db)
    return handler({ tx, audit })
  })
}
