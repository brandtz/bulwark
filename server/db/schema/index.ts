/**
 * server/db/schema/index.ts — schema barrel.
 *
 * drizzle.config.ts points here. Add new schemas to the export list.
 *
 * E11-S1 (2026-05-05): the 10 deferred schemas (assessments, standards,
 * quotes, subcontractors, work_orders, jobs, compliance_docs, invoices,
 * api_keys, audit_log) are now in place. Real services will land
 * one-by-one in E11-S5 through E11-S12 behind `BULWARK_BACKEND=real`.
 */

export * from './_shared'
export * from './organizations'
export * from './users'
export * from './clients'
export * from './properties'
export * from './assessments'
export * from './standards'
export * from './subcontractors'
export * from './quotes'
export * from './work_orders'
export * from './jobs'
export * from './compliance_docs'
export * from './invoices'
export * from './api_keys'
export * from './audit_log'
