/**
 * shared/contracts/index.ts — barrel for cleaner UI imports.
 */
export * from './_shared'
export * from './auth'
export * from './property'
export * from './client'
export * from './assessment'
export * from './quote'
export * from './subcontractor'
export * from './work-order'
export * from './job'
export * from './compliance'
export * from './invoice'
export * from './standards'
export * from './api-key'
export * from './audit'
export * from './services'
export * from './program'
export * from './label'
export * from './status-pipeline'
export * from './trade'
export * from './org-settings'
// W2-3 / EH-G — change orders + invoice payment ledger (ADR-0020).
export * from './change-order'
export * from './invoice-payment'
// EH-H / W2-4 — admin hub Part B (users, flags, providers, webhooks, notifs).
export * from './user'
export * from './feature-flag'
export * from './provider-config'
export * from './webhook'
export * from './notification-subscription'
// EH-F / W2-2 — inspection template engine (ADR-0019).
export * from './inspection-template'
export * from './inspection'
// W2-5 / EH-I — auth hardening: MFA + permission overrides (ADR-0023/24/25).
export * from './mfa'
export * from './permission'
// W2-1 / EH-E — property depth (ADR-0018).
export * from './building'
export * from './contact'
export * from './property-photo'
export * from './property-attachment'
// W3-1 / EH-J — in-app notification feed (ADR-0027).
export * from './notification'
// W3-2 / EH-K — reporting + dashboards (ADR-0030).
export * from './reporting'
// W3-5 / EH-P — global search + saved views (ADR-0033).
export * from './search'
export * from './saved-view'
