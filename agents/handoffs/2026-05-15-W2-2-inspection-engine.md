# Handoff — Wave 2 / W2-2 — Inspection Template Engine (EH-F)

**Date:** 2026-05-15.
**ADR:** [ADR-0019](../decisions/ADR-0019-inspection-templates-as-data.md).
**Migration:** `server/db/migrations/0004_awesome_abomination.sql`.

## What shipped

End-to-end dynamic inspection capture for every Bulwark program. The seeded
Wildfire Retrofit template proves the engine; subsequent programs add rows,
not code.

### New surfaces

- **Dynamic form** — `app/components/inspections/InspectionForm.vue`. Renders
  any template, supports conditional fields, repeatable sections (e.g.
  per-deck zones), auto-save (800 ms debounce + `onBeforeUnmount` flush), and
  submit-and-sign via a SignaturePad modal.
- **Property inspection pages** —
  `app/pages/admin/properties/[id]/inspection/new.vue` (template picker → seed
  inspection → redirect) and
  `app/pages/admin/properties/[id]/inspection/[inspectionId].vue` (thin
  wrapper around `InspectionForm`).
- **Settings authoring** — `app/pages/settings/inspection-templates.vue`.
  Section + field editor modal, role-gated to `ROLE_GROUPS.admin`. Settings
  hub gains an Inspection-templates card (org_admin count 14 → 15, super_admin
  15 → 16; `tests/e2e/settings-matrix.spec.ts` updated accordingly).
- **Legacy banner** — `app/pages/admin/properties/[id]/assessment.vue` carries
  a `data-testid="legacy-assessment-banner"` callout pointing crews to the
  new inspection flow.

### New runtime

- **Pure evaluator** — `shared/utils/inspection-evaluator.ts` returns
  `InspectionIssue[]` from a template + response set. Six rule kinds:
  `required`, `must_be_true`, `must_be_false`, `must_be_one_of`, `min`, `max`.
  Severity is `error | warning` (no critical/major).
- **Mock services** —
  `shared/mocks/inspection-template.mock.ts` (templates + sections + fields,
  bootstrap idempotency, `__resetMockInspectionTemplateState()` test reset) +
  `shared/mocks/inspection.mock.ts` (inspections + responses, takes a
  `TemplateProvider` closure for evaluator wiring).
- **Real services** — `server/services/inspection-template.real.ts` +
  `server/services/inspection.real.ts`. Both use `withAudit`. The real
  inspection service owns a private `RealInspectionTemplateService` so
  `evaluate()` works without DI. `saveResponses` upserts on
  `(inspectionId, sectionInstanceKey, fieldSlug)`. `submit` + `sign` write
  `state_change` audit rows.
- **Wildfire defaults** — `shared/inspection-templates/wildfire-defaults.ts`.
  Eight sections: `zone_0`, `zone_1`, `zone_2`, `roof`, `vents`, `eaves`,
  `siding`, `deck` (repeatable). Severities limited to `error | warning`.

### Seed + DB

- `scripts/db-seed.mjs` inserts the wildfire template per demo org with
  deterministic ids (`mk('inspection-template-wildfire-' + org.slug)`),
  wipes prior responses + inspections + fields + sections + templates for
  those orgs, then links each program: `UPDATE programs SET
  inspection_template_id = $tid WHERE id = $programId`.
- Migration `0004_awesome_abomination.sql` was emitted by `pnpm db:generate`
  and includes the five W2-2 tables plus the pre-existing orphan
  W2-4/W2-5 schemas that were already living in the barrel (feature_flags,
  pending_invites, provider_configs, webhook_deliveries, webhooks,
  notification_subscriptions). Those rolled in naturally and are not edited
  here.

### Barrels touched

- `shared/contracts/index.ts` — adds `inspection-template` + `inspection`
  exports.
- `shared/contracts/services.ts` — `BulwarkServices` gains
  `inspectionTemplate` + `inspection` under the `// EH-F / W2-2` block.
- `shared/mocks/factory.ts` — instantiates the two mock services; the
  inspection mock receives a closure over `inspectionTemplate.getWithSections`
  for evaluator wiring.
- `server/utils/services-factory.ts` — instantiates both real services with
  the shared tenant resolver.

### Compliance hook

`server/services/compliance.real.ts#syncFromJob()` now looks up the latest
inspection for the property; if it has a `programId`, it calls
`inspectionService.evaluate()` inside `try/catch` and logs the result via
audit (`metadata.kind = 'inspection_evaluator_used'`). The evaluator is
non-blocking — failures fall back silently and the compliance doc still
ships.

## Tests

- **Unit (new):**
  `tests/unit/inspection-template-evaluator.test.ts` — all-pass, every rule
  kind violated, min/max severities flow through; 3 cases.
  `tests/unit/inspection-template-bootstrap.test.ts` — idempotency, all 8
  wildfire sections seeded, empty skeleton for unknown program slug; 3 cases.
- **E2E (new):**
  `tests/e2e/inspection-dynamic.spec.ts` — admin opens property → starts
  wildfire inspection → fills fields → signs → sees issues banner.
  `tests/e2e/settings-inspection-templates.spec.ts` — admin adds a field →
  opens new inspection → field renders.

## Known gaps / follow-ups

1. **Compliance HTML still hardcodes assessment fields.** Evaluator output is
   logged to audit only. A future wave should pipe `InspectionIssue[]` into
   `renderComplianceDocHtml` so the PDF reflects the captured inspection.
2. **No template versioning UI.** Edits to built-in templates mutate
   `version=1` in place. Acceptable while demos are the sole consumer; needs
   immutable versions + drift detection before customer rollout.
3. **PWA / offline capture** rolls into Phase 2 sync-queue. The
   `(inspectionId, sectionInstanceKey, fieldSlug)` uniqueness was chosen so
   last-write-wins merging is tractable later.
4. **Pre-existing typecheck errors are unchanged by W2-2** —
   `app/pages/admin/invoices/*.vue` + `audit.real.ts` + `labels/defaults.ts`
   + `invoice.mock.ts` + `quote.mock.ts`. None of these are W2-2 files; see
   the BUILD_STATUS log for the W2-3+ remediation.
