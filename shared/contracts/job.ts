/**
 * shared/contracts/job.ts — async job contract (E7-S1).
 *
 * # Decisions (ADR-0008)
 *   - The async-job pattern (BULWARK_TECH §9) is the universal
 *     primitive for any work that can't complete inside an HTTP
 *     request. Compliance doc generation (E7) is the first consumer;
 *     audio transcription (Phase 3) will reuse the same shape.
 *   - `JobKind` is an open enum because new consumers add new kinds.
 *     We seed it with `compliance_doc` and let downstream stories
 *     extend the enum value list.
 *   - `payload` is unstructured at this layer — each kind interprets
 *     it. We intentionally don't model a discriminated union here:
 *     downstream stories validate their own payload shape inside the
 *     handler that picks the job up. Keeps this contract stable.
 *   - `resultUrl` is the canonical success channel (e.g. signed R2
 *     URL). `error` is the canonical failure channel.
 *
 * # Decision cast down
 *   - Rejected: a `progress` percentage. Modeling progress accurately
 *     requires job handlers to emit it, and the v1 mock has none. The
 *     UI shows a spinner instead; we'll add progress when Puppeteer
 *     wiring lands in E11.
 *   - Rejected: per-kind input/output schemas in this file. Better to
 *     keep them next to each consumer (e.g. a `compliance.ts` schema
 *     can validate the payload it pushes through the job pipe).
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Status — terminal states are `succeeded` and `failed`. UI polling stops on
// either. `running` is rendered the same as `queued` in the spinner copy
// today (no progress bar yet); we keep the distinction for telemetry.
// ----------------------------------------------------------------------------
export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
])
export type JobStatus = z.infer<typeof JobStatusSchema>

export function isTerminalJobStatus(s: JobStatus): boolean {
  return s === 'succeeded' || s === 'failed'
}

// ----------------------------------------------------------------------------
// Kind — additive enum. Extend as new consumers land.
// ----------------------------------------------------------------------------
export const JobKindSchema = z.enum(['compliance_doc'])
export type JobKind = z.infer<typeof JobKindSchema>

// ----------------------------------------------------------------------------
// Job row.
// ----------------------------------------------------------------------------
export const JobSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    kind: JobKindSchema,
    status: JobStatusSchema,
    /** Free-form JSON payload — each kind owns its own shape. */
    payload: z.record(z.unknown()).default({}),
    /** Populated on success (e.g. signed R2 URL). */
    resultUrl: z.string().url().nullable(),
    /** Populated on failure (human-readable message). */
    error: z.string().nullable(),
  })
  .merge(AuditFieldsSchema)
export type Job = z.infer<typeof JobSchema>

// ----------------------------------------------------------------------------
// Create input — caller specifies kind + payload, server fills the rest.
// ----------------------------------------------------------------------------
export const JobCreateInputSchema = z.object({
  organizationId: UuidSchema,
  kind: JobKindSchema,
  payload: z.record(z.unknown()).default({}),
})
export type JobCreateInput = z.infer<typeof JobCreateInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IJobService {
  create(input: JobCreateInput): Promise<Job>
  get(id: string, organizationId: string): Promise<Job | null>
}
