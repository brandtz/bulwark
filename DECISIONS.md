# Bulwark — Architecture Decision Log

> Index of Architecture Decision Records (ADRs).
> Each ADR lives at `agents/decisions/ADR-NNNN-<slug>.md`.
>
> ADR format: Status / Context / Decision / Consequences / Alternatives Considered.
>
> **Rule**: every "D-level" decision in [BUILD_PLAN.md](BUILD_PLAN.md) §2 has
> a backing ADR here. Code that depends on a decision **must reference the ADR ID
> in a top-of-file comment**. This is the only way human maintainers can audit
> *why* the code looks the way it does six months from now.

---

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](agents/decisions/ADR-0001-stack-nuxt3.md) | Confirm Nuxt 3 + Drizzle + Neon stack | Accepted | 2026-05-03 |
| [ADR-0002](agents/decisions/ADR-0002-multi-tenant-shared-db.md) | Multi-tenant via shared DB + organizationId column | Accepted | 2026-05-03 |
| [ADR-0003](agents/decisions/ADR-0003-frontend-first.md) | Frontend-first build order with mock service layer | Accepted | 2026-05-03 |
| [ADR-0004](agents/decisions/ADR-0004-mock-service-pattern.md) | Mock vs Real service split behind one composable | Accepted | 2026-05-03 |
| [ADR-0005](agents/decisions/ADR-0005-single-app-shell.md) | Single AppLayout owns all persistent navigation | Accepted | 2026-05-03 |
| [ADR-0006](agents/decisions/ADR-0006-config-screens-mandatory.md) | Every tenant-tunable value has an Admin config screen | Accepted | 2026-05-03 |
| [ADR-0007](agents/decisions/ADR-0007-playwright-required-per-story.md) | Playwright test required per UI-affecting story | Accepted | 2026-05-03 |
| [ADR-0008](agents/decisions/ADR-0008-rich-comments.md) | Rich rationale comments on every non-trivial file | Accepted | 2026-05-03 |
| [ADR-0009](agents/decisions/ADR-0009-skip-boilerplate-app.md) | Adopt boilerplate process, not its app code | Accepted | 2026-05-03 |
| [ADR-0010](agents/decisions/ADR-0010-slice-shippability.md) | Each story must be independently shippable | Accepted | 2026-05-03 |
| [ADR-0011](agents/decisions/ADR-0011-demo-frozen.md) | Demo folder frozen; product code lives at repo root | Accepted | 2026-05-03 |

---

## Adding a new ADR

1. Pick the next number.
2. Copy `boilerplate/agents/templates/adr-template.md` into `agents/decisions/`.
3. Fill it out. Status starts as `Proposed`.
4. Land it in a PR. Sponsor (Matthew) flips to `Accepted` or `Rejected`.
5. Add the row above.
