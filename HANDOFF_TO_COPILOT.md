# Handoff → GitHub Copilot (from Claude Cowork session, 2026-07-06)

> Companion to [`agents/handoffs/S-2026-07-06-001-cowork-wave1.md`](agents/handoffs/S-2026-07-06-001-cowork-wave1.md)
> (what shipped + how to verify). This file is the **remaining-work brief**:
> everything the Cowork session could NOT complete, in build order, with the
> constraints that mattered. Feed each section into a Copilot session as an
> Act-1 prompt; keep the Act-2 role-challenge tiers noted per item.

## 0. First actions on Matthew's machine (before any new feature work)

1. `pnpm typecheck && pnpm lint && pnpm test:unit` — sandbox ran the full
   vitest suite (453 green, real fresh Postgres) + eslint + a server/shared
   tsc slice, but **whole-project vue-tsc and Playwright have not run**.
2. `pnpm db:migrate` — applies `0012_l05_job_kinds.sql` (additive enum values).
3. `pnpm test:e2e` — includes 2 new specs (`storage-health`, `scheduled-jobs`;
   export `BULWARK_CRON_SECRET=test-secret` for the bearer-path tests).
4. Run the worker once and watch a retry cycle live (see handoff caveat #1).
5. Commit in the 6-commit sequence listed in the session handoff.

## 1. Remaining Wave-1 work (next up, all AUTO)

### L02 — Asset uploads migrated to storage (NEXT EPIC — start at S1)
- Wire property photos, then attachments, then avatars (S3) and branding
  logo (S4) onto presign→PUT→finalize→store-KEY.
- **Blocking preconditions inside this epic** (gap §3.1.7/3.1.8): finalize
  must return + pin the object **etag** (or copy-on-finalize) before any
  consumer persists keys; sensitive downloads need per-entity RBAC minted by
  owning services, not the generic org-scoped presign-download.
- The L01-S4 health endpoint's legacy census is your migration meter — drive
  every non-avatar count to zero.
- Review tier: FULL (storage + tenant boundary).

### L06 — Data layer
- S-critical: quote/invoice numbering race (gap §3.6.2) — sequence-per-org or
  advisory-lock + **UNIQUE constraint** + migration; composite
  `(org_id, status, created_at)` indexes on properties/quotes/invoices/
  work_orders/inspections; cursor pagination option; N+1 verification on
  compliance + property lists. Review tier: SECURITY_ONLY.

### Gate substrate (pull in before Wave-2 stories land)
- **L07-S1 CSRF**: double-submit token on the RPC dispatcher + all
  state-changing routes (the new `/api/admin/jobs/*` POSTs are bearer/session
  gated but should adopt the token for the session path too).
- **L07-S3 tenant-firewall matrix test**: grep-audit every `*.real.ts` method
  for `assertSameTenant` and lock with a test. Note: `RealJobService.
  listRecentRuns` is intentionally resolver-less (platform scope, route-gated)
  — encode it as an explicit exception, don't "fix" it.
- **L09-S2 axe-core gate** + **L10-S1 Lighthouse budget** in CI.

## 2. Wave 2+ (unchanged from BUILD_PLAN, no work started)

- **L07** rest: MFA org policy, consolidated env-guard (replace
  `server/jobs/env-guard.ts` per its header note), SAST/dep-scan CI, stale
  "plaintext" comment fix (§3.5.5).
- **L08**: Sentry (wire `recordFailureAlert` in `server/jobs/worker.ts` to
  Sentry capture — the hook point is marked), Prometheus exposition
  (`jobs_succeeded_total`/`jobs_failed_total` counters are in place),
  health/readiness consolidation, log shipping.
- **L03** comms fail-loud; **L09/L10/L19**; **L13** portal depth
  (homeowner/sub detail views — remember: no "coming soon" placeholders,
  sponsor directive); **L11** document completeness — the homeowner invoice
  PDF (its UI promise was removed; build the real thing here; the renderer's
  `RenderTemplate` pattern from L12-S2 is the template seam to follow);
  **L15** insurer role; **L14** Stripe (test-mode); **L16–L18, L20** launch.

## 3. Constraints the sandbox imposed (context for odd-looking choices)

- No Playwright/Chromium, no `sudo`, 45-second command ceiling → e2e specs
  are **authored but unexecuted**; vue-tsc ran as a server/shared tsc slice.
- Fresh embedded Postgres for integration tests — which is exactly what
  exposed the three latent bugs recorded in gap-register §5. Recommendation:
  add a CI lane that runs migrations + integration tests against a
  **fresh** database every time, not a long-lived seeded one.
- Two pre-existing tsc artifacts under the slice harness (weak-type
  `ProcessEnv` in `server/services/storage/index.ts`, app-composable ambient
  types) are expected to disappear under real `nuxt typecheck`; if
  `storage/index.ts` errors there too, apply the same
  `Record<string, string | undefined>` pattern used in
  `server/jobs/env-guard.ts`.

## 4. Sponsor-gated items (nothing Copilot can do — Matthew's list)

R2 keys · Resend/Twilio keys · Stripe keys + webhook secret · Neon
`DATABASE_URL` · Sentry DSN · legal copy · production domain/TLS ·
**Render cron provisioning with `BULWARK_CRON_SECRET` + `BULWARK_APP_URL`**
(this is what flips the GDPR purge from "shipped" to "running").
