# ADR-0019 — Inspection Templates as Data

**Status:** Accepted — 2026-05-15.
**Builds on:** [ADR-0013](ADR-0013-gc-generalization-programs.md) (Programs),
[ADR-0016](ADR-0016-status-pipelines-as-data.md) (config-as-data pattern),
[ADR-0017](ADR-0017-domain-event-bus.md) (auto-status transitions).

## Context

Phase 1's `assessment.vue` was a hard-coded Oregon-wildfire form. To turn
Bulwark into a true GC field-service platform per ADR-0013, every program
needs its own field-capture form. We considered three options:

1. **Per-program Vue pages.** Each program ships a hand-written form. Rejected:
   doesn't scale, fights tenancy (admins want to tweak fields without a
   deploy), duplicates compliance-evaluator code per page.
2. **One mega-form with feature flags.** Rejected: turns the assessment file
   into a 4 000-line conditional, no obvious authoring surface, no per-tenant
   customisation.
3. **Templates-as-data + dynamic renderer.** Adopted. Template + sections +
   fields live in DB rows, a single `InspectionForm.vue` renders any template,
   and a pure evaluator turns responses into issues. Admins author templates
   in `/settings/inspection-templates`.

## Decision

### Data model

Five new tables (migration `0004_*.sql`):

- `inspection_templates` — one row per (org, program, slug, version);
  `is_builtin` flags the seeded wildfire defaults.
- `inspection_template_sections` — ordered, optionally repeatable, each with a
  `slug` + `label` + `repeatable_label` + `condition` jsonb.
- `inspection_template_fields` — owned by a section; `kind` enum +
  `options` jsonb + `rules` jsonb (evaluator-rule discriminated union).
- `inspections` — one row per capture, FK to `properties` + nullable
  `program_id`, status `draft|submitted|signed`.
- `inspection_responses` — `(inspectionId, sectionInstanceKey, fieldSlug)`
  unique key carries the value; `sectionInstanceKey` lets repeatable sections
  produce multiple rows (e.g. `deck-0`, `deck-1`).

### Field-kind enum

`text | longtext | number | currency | boolean | select | multiselect | date |
photo | signature | passfail | rating`. The dynamic renderer picks the
matching `Bulwark*` design-system primitive for each.

### Evaluator-rule shape

A discriminated union keyed on `kind`:

- `required`
- `must_be_true` / `must_be_false`
- `must_be_one_of` (string set)
- `min` / `max` (number bounds)

Each rule carries a `message` + `severity ∈ {error, warning}`. Severity is
intentionally only two-valued — we map it to the existing compliance issue
shape (`InspectionIssue { sectionInstanceKey, sectionSlug, fieldSlug,
severity, message }`). No critical/major: those are derived at the compliance
layer, not the inspection layer.

### Runtime contract

`shared/utils/inspection-evaluator.ts#evaluateInspection(template, responses)`
is a **pure function**. It indexes responses by
`(sectionInstanceKey, fieldSlug)`, walks every field's `rules`, and emits
`InspectionIssue[]`. Compliance.real.ts looks up the latest inspection for the
property inside `syncFromJob()` and calls `inspectionService.evaluate()`;
failures fall back silently (the evaluator is non-blocking and the compliance
doc still ships).

### Backward compatibility

`app/pages/admin/properties/[id]/assessment.vue` is retained behind a banner
that links to `/admin/properties/[id]/inspection/new`. The legacy assessment
flow continues to write to its own table so demos and seeds keep rendering;
new programs use the inspection engine. No data migration — assessments and
inspections coexist.

### Authoring surface

`/settings/inspection-templates` lets org_admin / super_admin add / rename /
reorder sections + fields per program. Built-in templates (`is_builtin=true`)
remain editable but seeded fresh on `pnpm db:reset`. We do NOT version the
template-builder UI in v1: edits land on `version=1` in place. A future wave
introduces immutable versioning + drift detection.

## Consequences

- **Positive:** Each program gets a tailored capture form with zero new code.
  Compliance evaluator output is now data-driven, so adding a rule never
  requires a deploy. Admins own the form layout.
- **Positive:** The dynamic renderer is one file — easier to harden than N
  per-program pages.
- **Negative:** Compliance HTML rendering still consumes hardcoded
  assessment fields. Evaluator issues are logged to audit only until a future
  wave pipes them into `renderComplianceDocHtml`.
- **Negative:** No template versioning yet — editing a built-in template
  mutates in place. Acceptable while the demo is the only consumer.
- **Open:** PWA / offline capture story rolls into the Phase 2 sync-queue
  work; the new tables are designed for last-write-wins per
  `(inspectionId, sectionInstanceKey, fieldSlug)` so offline merging is
  tractable later.
