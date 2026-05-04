# Bulwark — Conventions

> **Note:** This file is the operative copy. The original lives at
> [docs/CONVENTIONS.md](docs/CONVENTIONS.md) and predates the build. Whenever
> they diverge, this root copy wins; reconcile via PR.

This is a thin pointer for now. The full conventions are spelled out in
the docs copy and are referenced directly by:

- [BUILD_PLAN.md](BUILD_PLAN.md) — slice-level Definition of Done
- [DECISIONS.md](DECISIONS.md) — ADR-0008 (rich comments), ADR-0010 (slicing)

In E0-S1's follow-up, the docs copy will be lifted here verbatim and the
docs copy replaced with a back-pointer. Tracked as a follow-up housekeeping
item — not a story-level commitment.

## TL;DR (operative now)

- TypeScript strict everywhere. No `any`. No `// @ts-ignore` without a
  linked ADR or issue.
- Money = integer cents. Always.
- `organizationId` on every tenant table. Service-layer firewall, not route.
- Soft delete (`deletedAt`). No hard `DELETE FROM` outside one-off scripts.
- Audit log every write that touches tenant data.
- Every file >40 LOC starts with the rich-comment block (ADR-0008).
- Every UI-affecting story ships with a Playwright spec (ADR-0007).
- Every config tunable has an Admin screen (ADR-0006).
- All persistent nav lives in `app/layouts/default.vue` (ADR-0005).
