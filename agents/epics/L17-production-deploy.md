# L17 — Production Deploy & Runbook

> **Phase:** C (Wave 6) · **Autonomy:** SECRET · **Depends on:** all Phase A/B
> **Owns gap-register:** §3.12.2 · **Decision:** ADR-0007

## Purpose
Make deploys safe, repeatable, and reversible: a canonical env/secret registry, the
Vercel (web) + Render (worker) configuration, a smoke canary that runs the primary
flow against the real backend post-deploy, and a documented rollback.

## Stories

### L17-S1 — Env var + secret registry
- **Docs/Code:** `docs/ENV.md` enumerating every env var (name, purpose, scope web/worker,
  required-in-prod?), cross-checked against the L07 env-guard so missing prod secrets fail
  closed at boot.
- **Acceptance:** env-guard and ENV.md agree; a missing required secret fails the deploy.

### L17-S2 — Vercel + Render configuration
- **Config:** finalize `vercel.json` (web, regions, build) + `render.yaml` (worker start,
  crons from L05, plan note for Chromium memory); both set `NODE_ENV=production`,
  `BULWARK_BACKEND=real`, real storage/PDF drivers.
- **Tests:** a config-lint/check that the two stay consistent (shared secrets present in both).

### L17-S3 — Post-deploy smoke canary
- **Tests:** a production-safe smoke (read-mostly + a reversible write to a sandbox property)
  that exercises auth → property → quote → invoice → compliance against the **real** backend
  and pages on failure.
- **Acceptance:** canary runs automatically after deploy; red canary blocks promotion.

### L17-S4 — Rollback + incident runbook
- **Docs:** `docs/RUNBOOK.md` — rollback steps (revert deploy, migration caution), on-call
  alerts (from L08), and the comms/secret recovery procedures.
- **Acceptance:** a dry-run rollback is documented and rehearsed in staging.
