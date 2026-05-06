/**
 * server/jobs/handlers/index.ts — job-kind → handler registry (E11-S9).
 *
 * # Decisions (ADR-0008)
 *   - One handler per JobKind. Handlers receive a typed envelope
 *     `{ jobId, organizationId, kind, payload }` and either resolve
 *     (success → `resultUrl?` string) or throw (failure → message
 *     captured into `jobs.error`).
 *   - The handler is intentionally pure of pg-boss specifics. The
 *     worker (server/jobs/worker.ts) wraps each handler in the boss
 *     subscription and translates errors → status updates.
 */
import type { JobKind } from '../../../shared/contracts/job'
import { complianceDocHandler } from './compliance-doc'

export interface JobEnvelope<TPayload = Record<string, unknown>> {
  jobId: string
  organizationId: string
  kind: JobKind
  payload: TPayload
}

export interface JobHandlerResult {
  /** Optional terminal URL (e.g. signed R2 URL). Stored on jobs.resultUrl. */
  resultUrl?: string
}

export type JobHandler = (env: JobEnvelope) => Promise<JobHandlerResult | void>

export const HANDLERS: Record<JobKind, JobHandler> = {
  compliance_doc: complianceDocHandler,
}
