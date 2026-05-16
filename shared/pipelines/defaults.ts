/**
 * shared/pipelines/defaults.ts — code-defined default pipelines per entity
 * type (Wave 1B / EH-H Part A / W1-3 / ADR-0023).
 *
 * # Why this file exists
 *
 * `IStatusPipelineService.bootstrap` reads from this catalog to seed
 * each tenant's default pipeline. The slugs match the existing Zod
 * status enums in `shared/contracts/*.ts` exactly — this is the
 * authoritative bridge between the platform's frozen status-enum
 * universe and the per-tenant editable pipeline rows.
 *
 * # Maintenance notes
 *
 *   - When a new status is added to e.g. `PropertyStatusSchema`, also
 *     add a node here AND extend the labels defaults under
 *     `shared/labels/defaults.ts`. The unit test
 *     `tests/unit/status-pipeline.test.ts` enforces that every status
 *     enum value has a default node.
 *   - `allowedTransitions` is a tenant-editable graph; the defaults
 *     here are a sensible STARTING POINT, not a rigid contract.
 *   - Exactly one node per entity is `isInitial=true`. At least one
 *     `isTerminal=true`.
 *
 * # Decisions cast down (ADR-0008)
 *
 *   - Rejected: declaring defaults inline in the bootstrap method.
 *     Diffing changes to default pipelines is easier with one focused
 *     module than scattered inside the service.
 *   - Rejected: generating from the enums + label maps mechanically.
 *     The transition graph is editorial (humans decide which states
 *     follow which), not derivable from enum membership.
 */
import type { StatusPipelineEntityType, StatusPipelineNodeInput } from '../contracts/status-pipeline'

export interface DefaultPipeline {
  nodes: StatusPipelineNodeInput[]
}

const lk = (entity: StatusPipelineEntityType, slug: string) => `status.${entity}.${slug}`

const PROPERTY_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'lead', labelKey: lk('property', 'lead'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['scheduled', 'on_hold', 'cancelled'] },
    { slug: 'scheduled', labelKey: lk('property', 'scheduled'), color: '#0EA5E9', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['assessed', 'on_hold', 'cancelled'] },
    { slug: 'assessed', labelKey: lk('property', 'assessed'), color: '#6366F1', description: null, sortOrder: 30, isInitial: false, isTerminal: false, allowedTransitions: ['quoted', 'on_hold', 'cancelled'] },
    { slug: 'quoted', labelKey: lk('property', 'quoted'), color: '#A855F7', description: null, sortOrder: 40, isInitial: false, isTerminal: false, allowedTransitions: ['accepted', 'on_hold', 'cancelled'] },
    { slug: 'accepted', labelKey: lk('property', 'accepted'), color: '#22C55E', description: null, sortOrder: 50, isInitial: false, isTerminal: false, allowedTransitions: ['in_progress', 'on_hold', 'cancelled'] },
    { slug: 'in_progress', labelKey: lk('property', 'in_progress'), color: '#F59E0B', description: null, sortOrder: 60, isInitial: false, isTerminal: false, allowedTransitions: ['completed', 'on_hold', 'cancelled'] },
    { slug: 'completed', labelKey: lk('property', 'completed'), color: '#10B981', description: null, sortOrder: 70, isInitial: false, isTerminal: false, allowedTransitions: ['compliance_pending', 'invoiced'] },
    { slug: 'compliance_pending', labelKey: lk('property', 'compliance_pending'), color: '#EAB308', description: null, sortOrder: 80, isInitial: false, isTerminal: false, allowedTransitions: ['compliance_complete', 'on_hold'] },
    { slug: 'compliance_complete', labelKey: lk('property', 'compliance_complete'), color: '#059669', description: null, sortOrder: 90, isInitial: false, isTerminal: false, allowedTransitions: ['invoiced'] },
    { slug: 'invoiced', labelKey: lk('property', 'invoiced'), color: '#0284C7', description: null, sortOrder: 100, isInitial: false, isTerminal: false, allowedTransitions: ['paid'] },
    { slug: 'paid', labelKey: lk('property', 'paid'), color: '#16A34A', description: null, sortOrder: 110, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'on_hold', labelKey: lk('property', 'on_hold'), color: '#EF4444', description: null, sortOrder: 120, isInitial: false, isTerminal: false, allowedTransitions: ['scheduled', 'in_progress', 'cancelled'] },
    { slug: 'cancelled', labelKey: lk('property', 'cancelled'), color: '#64748B', description: null, sortOrder: 130, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

const QUOTE_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'draft', labelKey: lk('quote', 'draft'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['sent'] },
    { slug: 'sent', labelKey: lk('quote', 'sent'), color: '#0EA5E9', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['accepted', 'rejected', 'expired'] },
    { slug: 'accepted', labelKey: lk('quote', 'accepted'), color: '#22C55E', description: null, sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'rejected', labelKey: lk('quote', 'rejected'), color: '#EF4444', description: null, sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'expired', labelKey: lk('quote', 'expired'), color: '#64748B', description: null, sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

const WORK_ORDER_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'draft', labelKey: lk('work_order', 'draft'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['scheduled', 'cancelled'] },
    { slug: 'scheduled', labelKey: lk('work_order', 'scheduled'), color: '#0EA5E9', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['in_progress', 'cancelled'] },
    { slug: 'in_progress', labelKey: lk('work_order', 'in_progress'), color: '#F59E0B', description: null, sortOrder: 30, isInitial: false, isTerminal: false, allowedTransitions: ['completed', 'cancelled'] },
    { slug: 'completed', labelKey: lk('work_order', 'completed'), color: '#10B981', description: null, sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'cancelled', labelKey: lk('work_order', 'cancelled'), color: '#64748B', description: null, sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

const INVOICE_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'draft', labelKey: lk('invoice', 'draft'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['sent', 'voided'] },
    { slug: 'sent', labelKey: lk('invoice', 'sent'), color: '#0EA5E9', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['partial', 'paid', 'voided'] },
    // W2-3 / EH-G — partial payments + voided.
    { slug: 'partial', labelKey: lk('invoice', 'partial'), color: '#F59E0B', description: null, sortOrder: 25, isInitial: false, isTerminal: false, allowedTransitions: ['paid', 'voided'] },
    { slug: 'paid', labelKey: lk('invoice', 'paid'), color: '#16A34A', description: null, sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'voided', labelKey: lk('invoice', 'voided'), color: '#64748B', description: null, sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

const COMPLIANCE_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'draft', labelKey: lk('compliance', 'draft'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['generating', 'cancelled'] },
    { slug: 'generating', labelKey: lk('compliance', 'generating'), color: '#F59E0B', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['ready', 'failed'] },
    { slug: 'ready', labelKey: lk('compliance', 'ready'), color: '#10B981', description: null, sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'failed', labelKey: lk('compliance', 'failed'), color: '#EF4444', description: null, sortOrder: 40, isInitial: false, isTerminal: false, allowedTransitions: ['generating', 'cancelled'] },
    { slug: 'cancelled', labelKey: lk('compliance', 'cancelled'), color: '#64748B', description: null, sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

const JOB_PIPELINE: DefaultPipeline = {
  nodes: [
    { slug: 'queued', labelKey: lk('job', 'queued'), color: '#94A3B8', description: null, sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['running'] },
    { slug: 'running', labelKey: lk('job', 'running'), color: '#F59E0B', description: null, sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['succeeded', 'failed'] },
    { slug: 'succeeded', labelKey: lk('job', 'succeeded'), color: '#10B981', description: null, sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
    { slug: 'failed', labelKey: lk('job', 'failed'), color: '#EF4444', description: null, sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
  ],
}

export const DEFAULT_PIPELINES: Record<StatusPipelineEntityType, DefaultPipeline> = {
  property: PROPERTY_PIPELINE,
  quote: QUOTE_PIPELINE,
  work_order: WORK_ORDER_PIPELINE,
  invoice: INVOICE_PIPELINE,
  compliance: COMPLIANCE_PIPELINE,
  job: JOB_PIPELINE,
}
