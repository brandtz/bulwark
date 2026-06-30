# ADR-0015 — Real backend is the runtime default; mocks demoted to test-only

- **Status**: Accepted
- **Date**: 2026-05-14
- **Authors**: W1-5 subagent (Phase 1 Hardening / EH-C)
- **Supersedes**: portions of [ADR-0004](ADR-0004-mock-service-pattern.md) (mock-as-default)
- **Related**: [PHASE1_HARDENING_PLAN.md §0 D-H3 / §2 Pivot P3](../../PHASE1_HARDENING_PLAN.md), [ADR-0012](ADR-0012-phase2-infrastructure.md)

## Context

ADR-0004 wired the `BULWARK_BACKEND` env switch with `'mock'` as the
default so the front end could ship before the database existed. Phase 1
of the build is now complete: every domain (`auth`, `property`, `client`,
`assessment`, `quote`, `subcontractor`, `workOrder`, `job`,
`complianceDoc`, `invoice`, `standards`, `apiKey`) has a corresponding
`server/services/*.real.ts` implementation, the migrations are
applied locally, and `scripts/db-seed.mjs` produces a coherent demo
dataset. Sponsor mandate D-H3 (Phase 1 hardening) explicitly says: "no
more mocks at runtime." Continuing to default to the mock backend hides
real-backend regressions in dev and CI.

## Decision

1. `nuxt.config.ts` defaults `runtimeConfig.public.backend` to `'real'`.
   `BULWARK_BACKEND=mock` becomes an explicit opt-in for offline dev
   demos.
2. `playwright.config.ts` mirrors the flip: the dev-server `env`
   defaults `BULWARK_BACKEND=real`. Real-mode serial-worker pinning
   (`workers: 1`, `fullyParallel: false`) introduced in E11 stays as-is.
3. Mock services (`shared/mocks/**`) are retained for unit tests
   (`tests/unit/**`) and integration tests (`tests/integration/**`)
   ONLY. Importing them from product code (`app/**`, `server/**`) is
   a code smell to be eliminated; the lint rule lands in EH-Q.
4. `pnpm db:reset` (new) drops + remigrates + reseeds the local DB. It
   is dev-only and guarded by the same `localhost`-only check as
   `db-seed.mjs`.
5. Existing specs that branch on `BULWARK_BACKEND === 'real'` are
   preserved unchanged in this wave; Wave 4 will rip out the mock
   branches once every real-mode-skipped spec has a real-mode answer
   (compliance worker wiring + JOSE invite tokens being the two
   outstanding gaps).

## Consequences

### Positive

- Dev = CI = prod in shape: a developer who runs `pnpm dev` exercises
  the same code path Playwright + Render + Vercel will exercise.
- Real-backend regressions surface immediately instead of at deploy
  time.
- Seed script is now the canonical source of "what does Bulwark look
  like on day one for a customer."

### Negative

- Local development now REQUIRES a running Postgres + `DATABASE_URL`
  in `.env.local`. Bootstrap friction increases for new contributors;
  mitigated by [docs/RUNNING.md](../../docs/RUNNING.md).
- CI must provision a Postgres for every e2e job. A throwaway lane
  with `BULWARK_BACKEND=mock` is retained until Wave 2 acceptance to
  cover the gap during the cutover.
- Deployment now hard-requires `DATABASE_URL`. The Vercel preview
  pipeline must point at a stub/staging DB; Phase 2 wiring on Neon
  was already planned per ADR-0012 §6.

### Neutral

- Mocks still exist; nothing was deleted. The directory tree is
  unchanged. Only the default flipped.

## Alternatives considered

1. **Keep `'mock'` as the default; document `BULWARK_BACKEND=real`
   loudly.** Rejected — sponsor mandate D-H3 is explicit, and "default
   loudly" never works in practice (devs forget; CI quietly green on
   mocks while real breaks).
2. **Delete the mock factory outright.** Rejected — unit tests would
   need to switch to real-DB integration tests overnight, which is a
   much larger ripple than the value justifies. Mocks remain useful
   for fast in-process tests of contract validation, tenant firewall,
   and pure math.
3. **Per-service mock-vs-real toggling.** Rejected as before
   (ADR-0004): the matrix explosion is not worth the marginal
   debuggability win.

## Implementation notes (Wave 1A / EH-C)

- `nuxt.config.ts` line 103: `'mock'` → `'real'`.
- `playwright.config.ts` line 51: `'mock'` → `'real'`.
- `app/plugins/services.ts` header comment refreshed.
- New `scripts/db-reset.mjs`; `pnpm db:reset` script.
- Seed script expanded with role-coverage personas (`org_manager`,
  `viewer`, full Acme role matrix) + 1 `ready`-state compliance doc.
- New canary spec `tests/e2e/happy-path-launch.spec.ts`.
- New `docs/RUNNING.md` documents the local-dev path.
- Handoff: `agents/handoffs/2026-05-14-W1-5-real-cutover.md`.
