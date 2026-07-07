/**
 * server/jobs/env-guard.ts — production fail-closed guard for the worker
 * (L04-S2 / ADR-0006).
 *
 * # What this file does
 *   - Refuses to boot the background worker in production with any dev/test
 *     stub flag active. A prod worker silently running `BULWARK_PDF_STUB=1`
 *     would "succeed" every compliance doc with a placeholder URL — worse
 *     than crashing, because nobody notices until an insurer rejects a doc.
 *
 * # Decisions
 *   - Pure function over an env snapshot so unit tests can exercise every
 *     combination without touching process.env.
 *   - L07-S4 owns the CONSOLIDATED env-guard for the web tier; per the L04-S2
 *     story note this is the minimal worker-side guard to be replaced by the
 *     shared one when L07 lands. Keep the rule list in sync until then.
 */
/**
 * Structural env snapshot — `Record<string, string | undefined>` so both
 * `process.env` and a plain test object satisfy it without weak-type
 * friction (the StorageEnv/ProcessEnv TS2559 lesson).
 */
export type WorkerEnv = Record<string, string | undefined>

/** Throws with an explicit message if a prod worker has a stub flag set. */
export function assertProdWorkerEnv(env: WorkerEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return
  const violations: string[] = []
  if (env.BULWARK_PDF_STUB === '1') violations.push('BULWARK_PDF_STUB=1 (stub PDF renderer)')
  if (env.BULWARK_STORAGE_DRIVER === 'fs') {
    violations.push('BULWARK_STORAGE_DRIVER=fs (filesystem storage)')
  }
  if (env.BULWARK_BACKEND === 'mock') violations.push('BULWARK_BACKEND=mock (mock services)')
  if (violations.length > 0) {
    throw new Error(
      `Refusing to start worker in production with dev/test stubs active: ${violations.join(
        '; ',
      )}. Unset these flags or set NODE_ENV correctly.`,
    )
  }
}
