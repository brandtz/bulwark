# ADR-0038 — Privacy posture, Data Subject Rights, and retention

**Status:** Accepted  
**Date:** 2026-05-16  
**Slice:** W5-4 (PHASE1_HARDENING_PLAN.md)  
**Related:** ADR-0008 (rich comments), ADR-0017 (audit), ADR-0027
(notifications), ADR-0034 (observability)

## Context

Bulwark collects personal data: account credentials, contact info
(name, email, phone), property addresses, financial counter-party
detail (invoice payees, payment methods), and audit-log records of
user activity. GDPR (EU/UK), CCPA/CPRA (California), and emerging
state laws (CO, CT, VA, UT, TX, …) impose obligations on us to:

1. Disclose what we collect and why.
2. Provide a contract for B2B customers (DPA / Art. 28).
3. Honor data-subject rights — access, rectification, erasure,
   portability, restriction, objection, withdraw consent.
4. Retain data only as long as necessary, with documented
   justifications.
5. Notify within statutory deadlines when a breach occurs.

A SOC2 Type 1 attestation is a frequent procurement gate. We're not
ready to commit to certification timing, but the privacy + audit
surface we ship here is a prerequisite either way.

## Decisions

### D1. Privacy / ToS / DPA as in-app pages

- We render `/privacy`, `/terms`, `/dpa` as public Nuxt pages with
  copy inline in the page templates. The auth middleware allows
  these routes without a session.
- **Why:** zero infrastructure cost, change history lives in git,
  link checks happen as part of normal app testing, and the same
  pages back the marketing site's deep links.
- **Phase 2 promotion:** when the CMS-label registry (ADR-0014)
  matures, paragraphs become label rows so an ops-level user can
  amend the policy without a deploy. For Phase 1, code-level edits
  are fine — every change should be reviewed by counsel anyway.

### D2. DSR flows = per-user export + soft-delete + 30-day hard-delete

- `/profile/data` exposes two buttons:
  * **Export** → `GET /api/account/export` returns a JSON file
    with the user's profile, memberships, homeowner / sub links,
    notifications, notification preferences, and the audit-log
    rows where they are `actor_user_id`. Audit rows authored by
    other users are excluded (no foreign-PII leakage). Capped at
    `ACCOUNT_EXPORT_AUDIT_CAP = 5000` rows with a `auditTruncated`
    flag for the rest.
  * **Delete** → `POST /api/account/delete` soft-deletes the user:
    clears `full_name` / `avatar_url` / `password_hash`, swaps
    `email` for `deleted-<sha256hash>@deleted.invalid` (keeps the
    unique constraint, keeps a fraud-prevention signal), flips
    `is_active=false`, sets `deleted_at=now()`, suspends
    memberships, writes audit row
    `security.account_deletion_requested`, then clears the session.
  * A daily cron (stub: `server/jobs/account-purge.ts`) calls
    `services.account.purgeExpiredDeletions()` which hard-deletes
    rows whose `deleted_at` is older than 30 days, nulling
    `audit_log.actor_user_id` first so audit events survive.
- **Why JSON, not CSV/PDF:** GDPR Art. 20 requires "structured,
  commonly used, machine-readable." JSON is exact-match.
- **Why 30 days:** balances reversal window (users change minds)
  with statutory expectation that erasure is timely. CCPA expects
  ≤45 days; GDPR ≤30 days; we sit at the strict end.
- **Why soft-delete-then-purge instead of immediate hard-delete:**
  fraud reversibility, regulatory holds, and the audit-log retention
  rule (we want to preserve events but redact actor identity).
- **Sole-admin guard:** if the user is the only active `org_admin`
  of an org, deletion is refused (`SoleAdminError → 409`). The user
  must transfer the role first; the UI surfaces a hint linking to
  `/admin/users`.

### D3. Cookie posture: essential only, no banner

- Bulwark Phase 1 sets exactly one cookie: the nuxt-auth-utils
  `nuxt-session` opaque session cookie. No analytics, no advertising,
  no third-party trackers, no localStorage cross-domain syncing.
- Essential cookies are exempt from the GDPR / ePrivacy consent
  requirement. We document this stance in the Privacy Policy
  §8 and skip the banner.
- **If we add non-essential cookies later:** introduce a
  `CookieConsentBanner.vue` component with Accept / Reject buttons
  writing to localStorage and gating the non-essential bootstrap.
  Today: not built; pre-empting infrastructure we don't need is the
  worst kind of cargo cult.

### D4. Retention is policy-level except for the hard-delete cron

- `docs/PRIVACY_AND_RETENTION.md` enumerates retention per table.
- Only `users` rows past 30-day soft-delete have an automated
  enforcer (`account-purge` job).
- Everything else (audit log 7yr, notifications 90d, etc.) is
  documented + reviewed annually. Engineering effort to wire
  automated purges for every table is high; the regulatory benefit
  is marginal at our scale; we revisit at SOC2 Type 1 prep.

### D5. Audit-log retention is 7 years

- Industry standard for security forensics + financial-records law.
- On hard-delete of a user, we null `audit_log.actor_user_id` for
  rows where they were the actor. The **event** survives (we still
  know what changed and when), but the **identity** does not. This
  is the GDPR-compatible read of "delete personal data while
  preserving security records" (Art. 17(3)(b) / 17(3)(e)
  exemptions).

### D6. Breach response is policy-documented, not automated

- `docs/BREACH_RESPONSE.md` is the runbook (triage, containment,
  assessment, 72-hour notification, post-mortem).
- We commit to the **72-hour controller notification** in the DPA
  (GDPR Art. 33-equivalent for processors).
- No automated breach-detection tooling in Phase 1. The structured
  logger (W5-2) emits the signals; alerts wire to platform tooling
  (ops decision).

### D7. SOC2 stance: "program in progress"

- All public-facing copy (Privacy §10, DPA §4) states "SOC2 program
  in progress." We do not claim certification.
- The privacy / audit / observability work landed across W5-1..W5-4
  is the foundation. A formal Type 1 attestation requires sustained
  evidence collection (logs, access reviews, change-management
  records) over 3–6 months and a third-party auditor — not in scope
  for Phase 1.

## Decisions NOT taken

- **Per-table automated purge cron.** Rejected: see D4.
- **Cookie consent banner.** Rejected for Phase 1: see D3.
- **In-app subprocessor management page.** Subprocessor disclosure
  lives in policy text (TBD per environment) and is delivered on
  request. A self-service registry is Phase 2 work alongside the
  customer-facing trust portal.
- **Cascade-delete audit rows.** Rejected: see D5 — we keep events,
  null actors.
- **DSR export streaming.** Rejected for Phase 1: bound at 5000
  audit rows; a truncated payload sets `auditTruncated: true` and
  the user can ask for the rest via support.
- **Per-org export filter.** Rejected: the user's data spans every
  org; the export is keyed on `userId`. Org-side business records
  (the org's properties, quotes, invoices, and audit-log rows
  authored by the user's colleagues) belong to the org as data
  controller, not the user as data subject.

## Consequences

- New file surface: `shared/contracts/account.ts`,
  `shared/mocks/account.mock.ts`, `server/services/account.real.ts`,
  `server/api/account/{export.get,delete.post}.ts`,
  `server/jobs/account-purge.ts`, `app/pages/{privacy,terms,dpa,
  goodbye,profile/data}.vue`.
- New labels namespace: `legal.*`.
- New ops actions (see W5-4 handoff): wire the cron, configure
  `privacy@` and `legal@` inboxes, fill in TBD copy (governing law,
  subprocessor list, hosting region).
- `users.deleted_at` already exists via `auditColumns` — no
  migration required.
