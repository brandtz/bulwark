# L19 — Compliance Multi-State Seam

> **Phase:** A (Wave 3) · **Autonomy:** AUTO · **Depends on:** —
> **Owns gap-register:** §3.11.1 · **Decision:** ADR-0009

## Purpose
Launch is Oregon-only, but the sponsor requires that nothing **hardcodes** Oregon in a
way that blocks adding other states later. The compliance evaluator must read
**tenant/program standards data**, with `OREGON_DEFAULT_STANDARDS` acting only as a
**seed**, not a runtime branch. This epic verifies and, where needed, refactors the
evaluator + inspection rules to be fully data-driven.

## Key decisions (ADR-0009)
- Standards live per tenant in the `standards` table + per-program inspection templates
  (already templates-as-data). The evaluator takes a standards argument; no module-level
  Oregon constant is referenced inside service code paths.
- A "jurisdiction" label on standards/programs makes multi-state additive (seed a new
  state's defaults; no code change).

## Stories

### L19-S1 — Evaluator data-source audit
- **Task:** trace `evaluateCompliance` + inspection rule evaluation; confirm they consume
  the tenant `standards` rows / template rules, not `OREGON_DEFAULT_STANDARDS` directly, in
  any server path. Document findings.
- **Acceptance:** a written map of every standards consumer + whether it is data-driven.

### L19-S2 — Refactor any hardcoded Oregon path to standards data
- **Server:** route any code that imports `OREGON_DEFAULT_STANDARDS` at runtime through the
  standards service (defaults seed the table on first org bootstrap instead).
- **Tests:** unit — an org with **edited** standards evaluates differently than the Oregon
  seed (proves data-driven); seeding a hypothetical second-state default set evaluates
  correctly with **no code change**.

### L19-S3 — Jurisdiction tagging + seed mechanism
- **Schema/contract:** optional `jurisdiction` on standards/programs; bootstrap seeds
  Oregon for the first customer; a documented path to add a state = insert a default set.
- **Tests:** integration — bootstrap seeds Oregon; adding a second jurisdiction's defaults is
  purely data.
- **Acceptance:** compliance is provably config-driven; adding a state needs no code.
