# W5-4 — Privacy + Compliance Posture — Handoff

**Date:** 2026-05-16  
**Slice:** W5-4 (PHASE1_HARDENING_PLAN.md Wave 5)  
**ADR:** [ADR-0038](../decisions/ADR-0038-privacy-and-dsr.md)  
**Status:** ✅ shipped (code + docs); ops actions outstanding

---

## TL;DR

Bulwark now ships a credible privacy + DSR posture:

- Public legal pages (`/privacy`, `/terms`, `/dpa`) and a deletion
  goodbye page (`/goodbye`).
- Per-user DSR controls at `/profile/data` with JSON export and a
  30-day soft-delete → hard-delete flow.
- A daily account-purge job stub (`server/jobs/account-purge.ts`)
  that hard-deletes after the grace period and nulls audit-log
  actor identities to satisfy the retention policy.
- Documented retention (`docs/PRIVACY_AND_RETENTION.md`) and breach
  response (`docs/BREACH_RESPONSE.md`).
- Footer + UserMenu links so authenticated users can reach the
  legal pages.

No migration was needed — `users.deleted_at` already exists via the
`auditColumns` helper. No new npm dependencies.

---

## Files created / modified

### Created

| Path | Purpose |
|---|---|
| `shared/contracts/account.ts` | DSR contract: schemas + `IAccountService` + `SoleAdminError` + constants. |
| `shared/mocks/account.mock.ts` | In-memory `MockAccountService` for tests + mock mode. |
| `server/services/account.real.ts` | Drizzle-backed `RealAccountService`. |
| `server/api/account/export.get.ts` | Authenticated JSON export download. |
| `server/api/account/delete.post.ts` | Self-service deletion endpoint (409 on sole-admin). |
| `server/jobs/account-purge.ts` | Daily cron stub. |
| `app/pages/privacy.vue` | Public Privacy Policy. |
| `app/pages/terms.vue` | Public Terms of Service. |
| `app/pages/dpa.vue` | Public Data Processing Addendum. |
| `app/pages/goodbye.vue` | Post-deletion landing page. |
| `app/pages/profile/data.vue` | "Account & data" surface (Export + Delete). |
| `docs/PRIVACY_AND_RETENTION.md` | Retention matrix + enforcement detail. |
| `docs/BREACH_RESPONSE.md` | Incident-response runbook. |
| `agents/decisions/ADR-0038-privacy-and-dsr.md` | Architectural decisions. |
| `tests/unit/account-export.test.ts` | Export shape + foreign-actor exclusion. |
| `tests/unit/account-deletion.test.ts` | Sole-admin guard + PII null-out. |
| `tests/unit/account-purge.test.ts` | 30-day cutoff enforcement. |

### Modified

| Path | Change |
|---|---|
| `shared/contracts/services.ts` | Adds `account: IAccountService` to `BulwarkServices`. |
| `shared/mocks/factory.ts` | Wires `MockAccountService`. |
| `server/utils/services-factory.ts` | Wires `RealAccountService`. |
| `app/middleware/auth.global.ts` | Adds `/privacy`, `/terms`, `/dpa`, `/goodbye` to PUBLIC_ROUTES. |
| `app/layouts/default.vue` | Adds legal footer with three links. |
| `app/components/nav/UserMenu.vue` | Adds "Account & data" entry. |
| `shared/labels/defaults.ts` | Adds `legal.*` namespaces. |
| `BUILD_STATUS.md` | Wave 5 / W5-4 completion entry. |

---

## Migration

**None.** `users.deleted_at` is provided by the shared `auditColumns`
helper in `server/db/schema/_shared.ts` and is already present on
the `users` table. No new columns required.

If a future change adds a dedicated retention table or moves the
email placeholder into a separate `email_hash` column, that would
take the next ID — **0012_*** is the reserved next slot.

---

## Test count delta

3 new unit specs:

- `tests/unit/account-export.test.ts` — 4 cases.
- `tests/unit/account-deletion.test.ts` — 3 cases.
- `tests/unit/account-purge.test.ts` — 3 cases.

**Total delta: +10 unit tests, +3 unit files.** `vue-tsc --noEmit`
and `vitest run tests/unit` both stay green.

---

## Ops actions required

The code is shipped; these are the operational follow-ups before
this surface is launch-ready:

1. **Wire the account-purge cron.**
   - Call `runAccountPurge(event)` in `server/jobs/account-purge.ts`
     from your scheduler of choice (Render cron, pg-boss schedule,
     external scheduler hitting an admin endpoint).
   - Daily cadence is fine; nothing about it requires sub-day
     resolution.
2. **Provision the privacy / legal inboxes.**
   - `privacy@bulwark.example` — referenced from the Privacy Policy.
   - `legal@bulwark.example` — referenced from Terms + DPA.
   - `security@bulwark.example` — referenced from the breach
     runbook.
3. **Fill in TBD placeholders before public launch.**
   - Terms §11 (governing law + venue) — needs counsel.
   - Privacy §4 (subprocessor list) — track per environment.
   - Privacy §5 (international transfers / hosting region) — per
     environment.
   - DPA §3 (subprocessor list) — same source as Privacy §4.
4. **Status page.**
   - Breach runbook §5 references "status page (TBD per
     environment)." Stand up a status page or remove the reference.
5. **Counsel review.**
   - Privacy Policy, Terms of Service, and DPA stubs are
     reasonable starting points but **must be reviewed by counsel
     before launch.** Jurisdiction-specific clauses are intentionally
     marked TBD.
6. **Tabletop exercise.**
   - Breach runbook §8 commits to a 6-monthly tabletop. Schedule
     the first one before GA.

---

## Known gaps / not in scope

- **No cookie consent banner.** Phase 1 ships essential cookies only;
  ADR-0038 D3 explains the stance. If marketing/analytics cookies
  land later, build `app/components/legal/CookieConsentBanner.vue`
  at that time.
- **No e2e specs.** The 3 unit specs cover the service contract.
  An end-to-end Playwright spec walking sign-in → export → delete →
  goodbye is a Wave 5 follow-up.
- **Audit-event JSON inclusion.** Each audit row's `metadata` JSONB
  is embedded as-is. If any payload writer routinely puts another
  user's identifying data into `metadata` (e.g. recording a target
  user's email), that field should be redacted at write-time. A
  spot-check of current call sites did not find any such writer,
  but a follow-up audit by W5-2 (logger redaction) is recommended.
- **Hash-stable email placeholder.** On hard-delete, the email
  becomes `deleted-<sha256_first_16>@deleted.invalid`. If two
  different users somehow had the same email pre-deletion (which
  the unique constraint forbids in the first place), this still
  conflicts — by design.

---

## SOC2-Lite gap analysis (appendix)

This is a quick read of where we stand relative to a SOC2 Type 1
attestation, scoped to the **Security**, **Confidentiality**, and
**Privacy** trust service criteria. *Not* a formal gap analysis.

### What we have

- **CC1 (control environment) — partial.** ADRs document
  decisions; CONVENTIONS.md captures coding standards; the audit
  log records every write. We don't have a written information
  security policy or evidence of management review yet.
- **CC2 (communication & information) — partial.** Audit log
  (ADR-0017), structured logger (ADR-0034), and now privacy /
  retention / breach docs cover the engineering side. External
  comms (status page, security disclosures policy) is TBD.
- **CC3 (risk assessment) — gap.** No formal risk register yet.
- **CC4 (monitoring) — partial.** Structured logger + metrics
  counters + audit log give us the raw signal. No SOC2-grade alert
  routing.
- **CC5 (control activities) — partial.** Tenant firewall
  (`assertSameTenant`), opaque session tokens, MFA (W2-5),
  permission overrides (W2-5), webhook signing (W2-4 / ADR-0022),
  rate-limit primitives + auth lockout (W2-5). No documented
  control matrix.
- **CC6 (logical & physical access) — partial.** Bcrypt password
  hashing, MFA, opaque session cookies, RBAC + per-user
  permissions. Physical access is the platform vendor's
  responsibility (vendor SOC2 inheritance — track in subprocessor
  list).
- **CC7 (system operations) — partial.** Job queue with retry +
  audit; ready/health endpoints. No documented incident-response
  runbook *before* this slice — now we have one.
- **CC8 (change management) — partial.** Git history + ADRs +
  PR review (assumed; not enforced in tooling). No formal CAB.
- **CC9 (risk mitigation — vendors) — gap.** Subprocessor list is
  TBD per env; no vendor security reviews documented.
- **Privacy (P-series) — partial.** Now: per-user DSR (P5),
  retention policy (P4), notice (P1), consent for marketing (P2,
  implicit — we don't market today), choice (P2). Quality (P6),
  access (P7), and disclosure (P8) are documented in policy but
  not all individually evidenced.

### Bigger gaps to close before Type 1

1. Written information security policy + access-control policy +
   change-management policy (CC1, CC5, CC8).
2. Formal risk register reviewed quarterly (CC3).
3. Vendor security reviews + subprocessor inventory (CC9).
4. Evidence collection: who reviewed what, when. We have the
   capability (`audit_log`); we need the *practice* of running
   quarterly access reviews and capturing them.
5. Sealed-secret storage for `provider_configs` + `webhooks` (KMS
   column) — already flagged by W4-3 as a Wave 5 candidate.
6. Real SES / Twilio wiring so the notifications channel reports
   carry the same audit detail as the in-app channel (W3-1
   handoff already flagged this).
7. Alert routing — `metrics.ts` counters need a destination beyond
   the in-process map. Tie into the platform's metrics endpoint
   (Vercel / Render) so SEV alerts actually wake someone up.
8. Backups + restore drills documented and exercised.
9. Tabletop exercise as committed in §8 of the breach runbook.
10. Counsel-reviewed legal pages with jurisdiction-specific clauses
    filled in.

### Estimated lift to Type 1 readiness

Roughly the same effort as one of our hardening waves. The platform
work is mostly done; what remains is policy authoring + evidence
collection + a third-party auditor engagement. Realistic target is
"end of Phase 2" assuming policy authoring starts immediately.

---

## Sign-off

W5-4 closes with `vue-tsc --noEmit` exit 0 and `vitest run
tests/unit` green. Ops actions above must complete before this
surface is launched to real users; the code is production-ready as
soon as the operational scaffolding lands.
