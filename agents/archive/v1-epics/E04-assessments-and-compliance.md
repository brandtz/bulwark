# Epic E4 — Assessment + Compliance Evaluator

> **Phase**: 1 | **Build order**: 5th | **Depends on**: E3

## Objective

Mobile-first assessment form (the GC's primary tool) plus the pure-function
compliance evaluator that flags non-compliant items against Oregon WUI standards.
Standards live in a config that the Admin can edit (E9).

## In Scope

- `app/pages/properties/[id]/assessment.vue` — assessment form
- `app/pages/properties/[id]/assessment-summary.vue` — compliance gap list + recommended upgrades
- `shared/utils/compliance.ts` — `evaluateCompliance(assessment, standards)` pure function
- `shared/contracts/assessment.ts` + `compliance.ts` Zod schemas
- `shared/mocks/MockAssessmentService.ts`
- Default OR standards seeded from `BULWARK_TECH.md §8` constants

## Out of Scope

- Editing standards (E9 ships `Settings → Compliance Standards`)
- Photo capture (E10 / Phase 2)

## Dependencies

E3 (property exists), E1 (FT-11 toggle, FT-09 select).

## Stories

| ID | Title | Visible delta |
|---|---|---|
| E4-S1 | `evaluateCompliance` pure function + Vitest unit tests | green tests |
| E4-S2 | Assessment form (mobile-first) backed by MockAssessmentService | sponsor can fill out, submit |
| E4-S3 | Assessment summary page rendering compliance result | non-compliant items show with standard reference |
| E4-S4 | Hook into property detail hub Assessment tab | tab populates with current assessment or "Start assessment" CTA |
| E4-S5 | **Playwright** — fill assessment with non-compliant roof → summary shows roof flag | green spec |

## Approval Status

Proposed.
