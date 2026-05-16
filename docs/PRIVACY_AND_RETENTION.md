# Privacy & Retention Policy

**Doc owner:** Privacy / Security  
**Last updated:** 2026-05-16  
**Related:** [Privacy Policy](../app/pages/privacy.vue) · ADR-0038

This document is the **internal retention policy** for personal data
held by Bulwark. The public Privacy Policy summarises the user-facing
view; this file is the authoritative breakdown by table.

> **Enforcement model.** Only the account-purge cron (Task B of W5-4)
> is an automated enforcer (30-day hard-delete after soft-delete).
> Everything else is **policy-level** — implemented by procedure and
> reviewed during quarterly access reviews. ADR-0038 records the
> trade-off.

## Retention table

| Table | PII category | Retention | Justification | Hard-delete trigger |
|---|---|---|---|---|
| `users` | Account: name, email, password hash, avatar | Until user deletion request + 30 days | Service delivery (GDPR 6(1)(b)); 30-day grace for reversal + fraud signal | Daily cron via `server/jobs/account-purge.ts` → `services.account.purgeExpiredDeletions()` |
| `memberships` | Account: which user belongs to which org | Until parent `users` row hard-deleted | Service delivery | Cascaded with `users` |
| `pending_invites` | Contact: invitee email | 90 days after accepted/revoked OR 30 days after expiry | Audit trail of who invited whom | Manual sweep (TBD) |
| `homeowner_users` | Property linkage | Until user hard-deleted OR property hard-deleted | Service delivery | Cascaded with `users` (purge job) |
| `subcontractor_users` | Sub linkage | Until user hard-deleted OR sub hard-deleted | Service delivery | Cascaded with `users` (purge job) |
| `properties`, `buildings`, `building_sections`, `property_photos`, `property_attachments`, `contacts` | Property + contact PII | 7 years from job completion | Warranty + tax + consumer-protection law | Policy-level (manual archive review at year 7) |
| `quotes`, `quote_*`, `change_orders` | Financial counter-party detail | 7 years from issuance | Tax + financial-records law | Policy-level |
| `work_orders`, `inspections`, `inspection_responses`, `inspection_template_*` | Work execution + inspection answers | 7 years | Warranty + dispute resolution | Policy-level |
| `invoices`, `invoice_payments` | Financial records | 7 years from issuance | Tax law (IRS recommends ≥7 yrs); consumer-protection statutes | Policy-level |
| `compliance_docs`, `subcontractor_coi_docs` | Compliance artefacts | 7 years from issuance | Regulatory + insurance audits | Policy-level |
| `audit_log` | Actor + entity diff | 7 years | Security forensics + legal hold | `actor_user_id` nulled on user hard-delete; row retained (event survives, identity does not) |
| `auth_attempts` | IP, user-agent, success/failure | 12 months | Security forensics | Policy-level (manual purge) |
| `api_keys` | Key hash + scope | Until revoked + 12 months | Forensics on prior key usage | Policy-level |
| `notifications` | Per-user delivered notice | 90 days from `created_at` | Bell feed UX + compliance | Policy-level cleanup task TBD; FK `ON DELETE CASCADE` covers user purge |
| `notification_subscriptions` | Channel preferences | Until user hard-deleted | Service delivery | Cascaded with `users` |
| `saved_views` | Per-user list filters | Until user hard-deleted | Service delivery | Cascaded with `users` |
| Session cookies | Opaque session id | 30 days rolling | Service delivery | Browser cookie expiry; server-side cleared on logout |
| Search indexes / analytics aggregates | De-identified counts | 13 months | Product analytics; ad-hoc reporting | Policy-level (rebuild quarterly) |
| Structured logs | Request metadata (with PII redaction per W5-2) | 30 days hot, 12 months cold | Operations + security | Log retention policy (platform-level) |

## Categories at a glance (cross-reference to Privacy Policy §1)

- **Account data** → `users`, `memberships`, `user_mfa`, `mfa_backup_codes`.
- **Contact data** → `contacts`, `pending_invites`, `homeowner_users`, `subcontractor_users`.
- **Property data** → `properties`, `buildings`, `building_sections`, `property_photos`, `property_attachments`, `inspections`, `inspection_responses`.
- **Financial data** → `quotes`, `change_orders`, `work_orders`, `invoices`, `invoice_payments`, `compliance_docs`.
- **Usage / security** → `audit_log`, `auth_attempts`, `api_keys`, structured logs.
- **Device / network** → request-scoped structured-log fields (IP, user-agent); not persisted in domain tables.

## Hard-delete enforcement detail (account-purge cron)

1. Cron runs daily (ops decision — schedule not yet wired; see W5-4
   handoff for ops actions).
2. Job calls `runAccountPurge(event)` in
   `server/jobs/account-purge.ts`, which delegates to
   `services.account.purgeExpiredDeletions()`.
3. Service selects `users` rows where `deleted_at IS NOT NULL AND
   deleted_at <= now() - INTERVAL '30 days'`.
4. For each candidate:
   - `audit_log.actor_user_id` is set to `NULL` (event preserved,
     identity removed).
   - `homeowner_users`, `subcontractor_users`, `memberships` rows for
     the user are deleted.
   - The `users` row is deleted. Cascading FKs (e.g.
     `notifications`, `notification_subscriptions`) handle the rest.

## Review cadence

- This table is reviewed annually by the privacy owner.
- Material changes are committed to `git` and reflected in the public
  Privacy Policy.
- Subprocessor list (Privacy Policy §4 and DPA §3) is reviewed
  quarterly.
