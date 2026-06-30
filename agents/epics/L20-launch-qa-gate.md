# L20 — Launch QA Gate

> **Phase:** C (Wave 6) · **Autonomy:** AUTO · **Depends on:** all
> **Owns gap-register:** verification of §1 (false-positive re-check) + whole-system sign-off
> **Decision:** ADR-0008

## Purpose
The final gate: prove the launch quality bar (BUILD_PLAN §2) holds across the whole
system before GA. This epic is verification + sign-off, not net-new features.

## Stories

### L20-S1 — Full role × portal e2e matrix
- **Tests:** a comprehensive Playwright matrix over every role (super_admin, org_admin,
  org_manager, field, sub_contractor, homeowner, **insurance_representative**, viewer) ×
  every portal's primary flow + negative permission cases; runs against the **real** backend.
- **Acceptance:** matrix green; each role sees exactly its surface.

### L20-S2 — Security sign-off (OWASP)
- **Tests/Task:** run the L07 SAST/dep scan; manual OWASP Top-10 walkthrough (authz,
  injection, CSRF, secrets, SSRF on signed URLs, rate-limit, session); record results in
  `docs/SECURITY_REVIEW.md`.
- **Acceptance:** no high/critical open; documented sign-off.

### L20-S3 — A11y + performance sign-off
- **Tests:** L09 axe gate + L10 Lighthouse/latency budgets green across the top routes;
  manual keyboard pass recorded.
- **Acceptance:** WCAG 2.1 AA + perf budgets met and CI-enforced.

### L20-S4 — Reliability + DR sign-off
- **Tests:** verify crons run (L05), jobs retry (L04), readiness/health (L08), backup/restore
  drill (L16), and the post-deploy canary (L17).
- **Acceptance:** reliability checklist closed.

### L20-S5 — Doc-vs-code final truth sweep + launch checklist
- **Task:** re-verify the gap-register false-positives stay fixed; confirm `BUILD_STATUS.md`,
  header comments, and `docs/` match the shipped code; produce the final `docs/LAUNCH_CHECKLIST.md`
  with every gate's status + the human-gated items (legal, secrets) called out.
- **Acceptance:** a single green launch checklist; nothing ships on a stale claim.
