/**
 * server/db/schema/index.ts — schema barrel.
 *
 * drizzle.config.ts points here. Add new schemas to the export list.
 *
 * Decisions NOT taken:
 *   - Many schemas (assessments, quotes, work_orders, subcontractors,
 *     compliance_docs, invoices, jobs, audit_log, api_keys) are intentionally
 *     deferred to E11 when they get wired to real persistence. Their Zod
 *     contracts (E0-S5) and mock services (E0-S6) carry the shape until then.
 */

export * from './_shared'
export * from './organizations'
export * from './users'
export * from './clients'
export * from './properties'
