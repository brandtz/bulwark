/**
 * server/jobs/handlers/index.ts — job-kind → handler registry (E11-S9, L04-S5, L05-S1).
 *
 * # Decisions (ADR-0008, ADR-0005)
 *   - One handler per JobKind. Handlers receive a typed envelope
 *     `{ jobId, organizationId, kind, payload }` and either resolve
 *     (success → optional `resultUrl` / `summary`) or throw (failure →
 *     message captured into `jobs.error`, pg-boss retries per policy).
 *   - The handler is intentionally pure of pg-boss specifics. The
 *     worker (server/jobs/worker.ts) wraps each handler in the boss
 *     subscription and translates errors → status updates.
 *   - `HANDLERS` is `Record<JobKind, JobHandler>` — adding a JobKind to the
 *     contract without a handler here is a TYPECHECK error (L04-S5). The
 *     queue list + retry policy derive from `server/jobs/policy.ts`, so a
 *     kind cannot exist without a policy either.
 */
import type { JobKind } from '../../../shared/contracts/job'
import { complianceDocHandler } from './compliance-doc'
import { accountPurgeHandler } from './account-purge'
import { coiExpiryScanHandler } from './coi-expiry-scan'
import { assetScanHandler } from './asset-scan'

export interface JobEnvelope<TPayload = Record<string, unknown>> {
  jobId: string
  organizationId: string
  kind: JobKind
  payload: TPayload
}

export interface JobHandlerResult {
  /** Optional terminal URL (e.g. signed R2 URL). Stored on jobs.resultUrl. */
  resultUrl?: string
  /**
   * Optional machine-readable run summary (counts etc.). The worker merges it
   * into the job row's payload under `_runSummary` and stamps it on the
   * success audit row, so the L05-S3 jobs surface can render "purged N".
   */
  summary?: Record<string, unknown>
}

export type JobHandler = (env: JobEnvelope) => Promise<JobHandlerResult | undefined>

export const HANDLERS: Record<JobKind, JobHandler> = {
  compliance_doc: complianceDocHandler,
  account_purge: accountPurgeHandler,
  coi_expiry_scan: coiExpiryScanHandler,
  asset_scan: assetScanHandler,
}
