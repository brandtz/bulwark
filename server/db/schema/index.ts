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
export * from './programs'
export * from './program_memberships'
// EH-B / W1-2 — CMS label registry + per-tenant branding (ADR-0014).
export * from './labels'
export * from './org_branding'
// EH-H / W1-3 — admin config: status pipelines, trades, org settings (ADR-0023).
export * from './status_pipelines'
export * from './trades'
export * from './org_settings'
// EH-F / W2-2 — inspection template engine (ADR-0019).
export * from './inspection_templates'
export * from './inspection_template_sections'
export * from './inspection_template_fields'
export * from './inspections'
export * from './inspection_responses'
// W2-3 / EH-G — change orders + invoice payments (ADR-0020).
export * from './change_orders'
export * from './invoice_payments'
// EH-H / W2-4 — admin hub Part B (users, flags, providers, webhooks, notifs).
export * from './feature_flags'
export * from './pending_invites'
export * from './provider_configs'
export * from './webhooks'
export * from './notification_subscriptions'
// EH-E / W2-1 — property depth: buildings, sections, contacts, photos, attachments (ADR-0018).
export * from './buildings'
export * from './building_sections'
export * from './contacts'
export * from './property_photos'
export * from './property_attachments'
// W2-5 / EH-I — auth hardening: attempts, MFA, permission overrides (ADR-0023/24/25).
export * from './auth_attempts'
export * from './user_mfa'
export * from './mfa_backup_codes'
export * from './permissions'
// W3-1 / EH-J — in-app notification feed (ADR-0027).
export * from './notifications'
// W3-4 / EH-N + EH-O — subcontractor + homeowner portals (ADR-0031/0032).
export * from './subcontractor_users'
export * from './homeowner_users'
export * from './subcontractor_coi_docs'
// W3-5 / EH-P — saved list views (ADR-0033).
export * from './saved_views'
