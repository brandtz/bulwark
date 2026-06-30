# Archive — v1 Build Artifacts (superseded 2026-06-30)

This folder holds the **first-generation** planning artifacts that drove Bulwark
from demo to a feature-complete pre-production application (Epics E00–E14, ADR-0001
through ADR-0038, Waves 1–5).

They are preserved **read-only for historical context**. They are **NOT** the
active plan.

| Folder | What it was |
|---|---|
| `v1-epics/` | The original E00–E14 epic set (frontend-first → backend wiring → portals). |
| `v1-decisions/` | ADR-0001 … ADR-0038 — every architecture decision taken during the v1 build. |

## Why archived

Per sponsor direction (2026-06-30), the project moved from "build the features" to
"**make it production-launch ready for a real first customer**." That required a
**full rescope** against a fresh, launch-oriented definition of done (security,
performance, accessibility, observability, real integrations, payments, and a
net-new insurer role). Rather than retrofit the v1 epics, we archived them and
authored a clean **L-series** production-launch workstream.

## Where the active plan lives now

- [`/BUILD_PLAN.md`](../../BUILD_PLAN.md) — the active production-launch master plan.
- [`/BUILD_STATUS.md`](../../BUILD_STATUS.md) — the live execution cursor.
- [`/PRODUCTION_GAP_REGISTER.md`](../../PRODUCTION_GAP_REGISTER.md) — the audit
  evidence base that the L-series epics remediate.
- [`agents/epics/`](../epics/) — the L-series epics (L01…L20) with story breakdowns.
- [`agents/decisions/`](../decisions/) — fresh ADRs (renumbered from ADR-0001).

> ADR references inside source-file header comments (e.g. "ADR-0024") point at the
> archived v1 decisions in `v1-decisions/`. They remain valid as historical
> rationale; new decisions are recorded in the fresh `agents/decisions/` folder.
