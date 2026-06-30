# ADR-0014: CMS Label Registry & Per-Tenant Branding

Status: Accepted
Date: 2026-05-14
Wave: 1A (W1-2 / EH-B)

## Context

Bulwark runs multi-tenant — every GC org sees the same screens but
expects to call things by their own names. The pilot org wants "Prospect"
instead of "Lead", a different word for one of the trade slots, and
their license number printed in the PDF footer. Phase 0 hard-coded all
of this copy across components (`PROPERTY_STATUS_LABEL` in the contract
file, `TRADE_LABEL` in WO pages, footer text in PDF templates). Renaming
required a code change and a deploy — unworkable for sales.

We also need each org to ship its own logo, color, and locale defaults
without code-side gymnastics. Today, branding lives in a half-written
`settings/company.vue` stub and PDF templates have hard-coded
`"Bulwark Construction"` text.

## Decision

Introduce two pieces of per-tenant CMS:

1. **Labels registry** — a `labels` table keyed by
   `(organization_id, namespace, key, locale)` storing the override
   value plus an optional admin note. Code defines the *default* copy
   in `shared/labels/defaults.ts`; the DB stores *only* overrides. A
   new composable `useLabel()` exposes `t(namespace, key, fallback)`
   which resolves override → default → fallback.

2. **Branding singleton** — an `org_branding` row per organization
   storing logo URL, primary/accent hex colors, footer text, support
   email/phone, license label, timezone, currency, and date format.
   Defaults are synthesized in the service layer when the row is
   missing so a fresh org renders an editable form on first paint.

Admin-only editor pages ship at `/settings/labels` and
`/settings/branding`. The labels editor pilots on two surfaces —
`StatusBadge.vue` (every property status pill) and the WO trade chip
on `/admin/work-orders/[id]` — proving the round trip end-to-end.

## Why a registry and not a config file checked into Git?

Two reasons:

- **Pilot org rename velocity.** The sponsor wants to A/B-test phrasing
  ("Lead" vs "Prospect") with no engineering involvement. A code-side
  config file would require a PR + deploy per rename.
- **Tenant isolation.** A code-side config can only express *global*
  defaults; per-tenant copy requires a DB row anyway, and once we have
  per-tenant rows the global config becomes vestigial.

## Why `(namespace, key, locale)` instead of a single flat key?

- Namespace lets the editor group rows into tabs (Statuses, Trades,
  Roles, …) without us hard-coding the grouping in the editor.
- A separate locale column is forward-looking. Phase 1 is en-US only,
  but encoding it as a column lets us add Spanish without a schema
  migration. Cost: one extra column in the unique index. Worth it.
- Keys are short and namespaced (`status.property.lead`,
  `trade.roofing`). The flat key `${namespace}.${key}` is what the
  composable consumes, so we expose both shapes (structured in the DB,
  flat at the consumer boundary).

## Why code defaults, DB overrides?

Two alternatives we rejected:

- **Seed defaults into the DB on install.** Coupling code refactors to
  migrations. Adding a new status would require a new migration to
  insert its label, and renaming the default copy would require an
  update migration that fights with admin overrides. No.
- **Generate the catalog from Zod enums at build time.** Defaults are
  human-readable display copy, not a mechanical title-case of the enum
  value. "In progress" not "In_progress". Hand-written defaults stay
  correct.

The unit test `tests/unit/labels.test.ts` enforces exhaustive coverage
of every status enum value, so forgetting a default fails CI rather
than silently shipping a blank row.

## Why pilot on only two surfaces?

The composable is cheap to call but adopting it across every status
pill, button label, email subject, and PDF footer in one slice is a
risky merge. We pilot on:

- `StatusBadge.vue` — the canonical pill, used everywhere property
  status renders.
- WO trade chip + assignment modal — proves the namespace/key pattern
  scales beyond `status.*`.

Wave 2 (EH-B follow-on) rolls the composable out to invoice PDFs,
email subjects/bodies, quote-builder CTAs, and the homeowner portal.
Each adoption is one-line and reversible.

## Scope cap (anti-feature-creep)

- No rich text. Labels are plain strings. Markdown lives in
  `pdf.footer` if needed but the editor input is a textarea, not a
  WYSIWYG.
- No localization at runtime for Phase 1. We store a locale column
  but only `en-US` is wired.
- No A/B testing infrastructure. The override is the override; if the
  sponsor wants to compare variants they can swap and observe.
- No logo upload widget for Phase 1. The branding form accepts a URL.
  An R2 upload widget is tracked in the W1-2 handoff and the Wave 2
  backlog.

## Consequences

**Positive**

- Sales and CSMs can rename copy per org without engineering.
- New status / trade / role enum values that forget a default fail CI.
- Branding row centralizes color + locale + license — PDF generators
  and email subjects can consume it instead of hard-coding strings.

**Negative**

- One more service to keep healthy in the mock + real factory. The
  generic RPC dispatcher (`server/api/services/[service]/[method]`)
  already routes calls so we did not need to add label-specific routes.
- Pages that render labels now depend on a fetch — we mitigate with a
  per-org `useState` cache and a lazy fire-and-forget reload so the
  first paint shows the in-code default while the override map flies in.

## Alternatives considered

1. **i18n library (vue-i18n).** Overkill for a single-locale app whose
   primary use case is per-tenant rename, not multi-language. Adopt
   later if we ever ship a real translation surface.
2. **Per-component prop drilling.** Pass `labelOverride?: string` into
   every component. Hostile to maintenance — the composable centralizes
   the rule.
3. **Generate a JSON catalog at build time from Markdown files in the
   repo.** Doesn't solve the per-tenant problem, which is the actual
   sponsor ask.

## Status

Accepted and shipped in Wave 1A. The pilot integrations on
`StatusBadge.vue` and the WO trade chip prove the round trip; the
Playwright spec `tests/e2e/settings-labels.spec.ts` locks the user-
facing contract.
