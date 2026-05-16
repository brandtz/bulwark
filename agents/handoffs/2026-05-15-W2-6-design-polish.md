# Handoff — W2-6 Design Polish + Signature Primitive (2026-05-15)

**Status:** Complete (presentation-only, no schema/contract/service changes)
**ADR:** [ADR-0026](../decisions/ADR-0026-design-system-polish.md)
**Wave:** Phase 1 Hardening → Wave 2 → W2-6 / EH-L

---

## Deliverables shipped

### A. `BulwarkSignaturePad` primitive
- **File:** `app/components/ui/BulwarkSignaturePad.vue` (NEW, ~200 LOC with
  rich-comment header)
- Native canvas + pointer events (mouse, touch, pen). No `signature_pad`
  npm dep.
- DPR-aware backing store.
- Explicit `Clear` + `Save` buttons. `Save` emits `update:modelValue`
  with a `data:image/png;...` data URL.
- `defineExpose({ clear, save })` for imperative parent-driven flows.
- a11y: `tabindex="0"`, `role="img"`, `aria-label="Signature canvas"`.
- **Coexists with** `app/components/compliance/SignaturePad.vue`. The
  legacy file is NOT removed — its callers (compliance generator,
  inspection submit modal) depend on `update:isEmpty` semantics that
  the e2e specs reach for via `data-testid="signature-pad-canvas"`.
  Migration is **deferred** (see ADR-0026 §Deferred).

### B. `BulwarkTableSkeleton` primitive
- **File:** `app/components/ui/BulwarkTableSkeleton.vue` (NEW)
- Props: `rows=5`, `cols=4`, `showHeader=true`.
- `animate-pulse` + `bg-slate-200` shimmer per spec.
- `aria-busy` + `aria-live="polite"`.
- **Wired into 3 list pages:**
  - `app/pages/admin/properties/index.vue` (`data-testid="properties-loading"`)
  - `app/pages/admin/quotes/index.vue` (`data-testid="quotes-loading"`)
  - `app/pages/admin/work-orders/index.vue` (`data-testid="work-orders-loading"`)
- All three preserve their existing `*-empty` empty-state and data-test
  selectors — skeleton only renders while `bundle === null` (or `list
  === null` for properties).

### C. Print stylesheet
- **File:** `app/assets/print.css` (NEW)
- Verbatim from W2-6 spec (`@media print` block).
- Wired into `nuxt.config.ts` `css[]` after `tokens.css` + `main.css`.
- `app/layouts/default.vue` marks `AppSidebar`, `AppTopBar`,
  `AppBottomNav` with `.no-print` (belt+braces alongside `nav`/`aside`
  rules). Main content gets `data-print-root` for future page-specific
  print rules.

### D. Icon adoption sprint

**Inline-SVG audit.** Across `app/**` only ONE `<svg>` tag exists
outside `BulwarkIcon.vue` itself — the demo app uses Unicode glyphs
(`▾`, `·`, `◇`) and CSS placeholder squares rather than inline SVG.
W2-6 instead drove adoption through the **single highest-leverage
surface**: persistent nav.

**Replacements (rendered icon instances):**

| Surface                                         | Before                                  | After                  | Instances |
|-------------------------------------------------|-----------------------------------------|------------------------|-----------|
| `app/components/nav/AppSidebar.vue`             | `<span class="bg-white/10" />` placeholder | `<BulwarkIcon :name="item.icon" />` | ~25 (one per nav row × roles)  |
| `app/components/nav/AppBottomNav.vue`           | `<span class="bg-current" />` placeholder | `<BulwarkIcon ... />`                | ~5 (mobile bottom-nav max)     |
| `app/components/nav/AppTopBar.vue`              | `▾` Unicode caret                       | `<BulwarkIcon name="chevron-down" />` | 1 (org-switcher chip)          |
| `app/components/nav/UserMenu.vue`               | `▾` Unicode caret                       | `<BulwarkIcon name="chevron-down" />` | 1 (avatar button)              |
| `app/pages/settings/index.vue`                  | (no icon)                               | `<BulwarkIcon :name="card.icon" size="lg" />` | 18 (one per settings card) |
| **Total rendered glyphs**                       |                                         |                                   | **~50**     |

Spec target was 30–50; W2-6 hits the upper bound through nav
centralization rather than hunting inline `<svg>` blocks that don't
exist.

**Nav config name remap.** `shared/nav/nav.config.ts` icon strings now
map to `ICON_NAMES` (unit-test enforced parity). The mapping:

| nav.config (before) | nav.config (after) | Why                                |
|---------------------|--------------------|------------------------------------|
| `document`          | `file-text`        | No `document` glyph in sprite      |
| `receipt`           | `dollar-sign`      | No `receipt` glyph in sprite       |
| `cog`               | `settings`         | Conventional rename                |
| `sun`               | `clock`            | No `sun` glyph; "Today" → clock    |

### E. a11y baseline (`app/layouts/default.vue`)
- **Skip-to-content link** — first interactive element, `sr-only
  focus:not-sr-only`, jumps to `#main-content`.
  `data-testid="skip-to-content"`.
- `<main id="main-content" tabindex="-1" data-print-root>` wraps page
  content.
- `AppSidebar`, `AppTopBar`, `AppBottomNav` carry `.no-print`.
- **ARIA labels added** to icon-only chrome:
  - `user-menu-button` → `aria-label="Open user menu"`
  - `org-switcher` link → `aria-label="Switch organization"`
- **Global `:focus-visible`** already in `main.css` (added E2-S1);
  validated to still cover all `<button>` + `<a>` (no per-component
  overrides found that would defeat it).

### F. Docs
- `agents/decisions/ADR-0026-design-system-polish.md` — full ADR.
- BUILD_STATUS line appended.
- This handoff.

### G. Tests (delta vs. previous run)
- **Unit:** 144 passing (was 130 pre-W2-6; +14 new across 3 new specs
  and 1 fixed spec).
  - `tests/unit/signature-pad.test.ts` (NEW, 6 tests)
  - `tests/unit/table-skeleton.test.ts` (NEW, 5 tests)
  - `tests/unit/bulwark-icon.test.ts` (FIXED — was broken because it
    imported `ICON_NAMES` from `BulwarkIcon.vue`, which Vitest cannot
    parse without `@vitejs/plugin-vue`. Now imports from
    `icon-names.ts`. 3 tests pass.)
- Tests are source-shape assertions because Vitest runs in node env
  without `@vitejs/plugin-vue`. The W2-6 hard constraint forbids new
  deps; full DOM behaviour is exercised by existing Playwright specs.

---

## Files created (8)

```
app/components/ui/BulwarkSignaturePad.vue
app/components/ui/BulwarkTableSkeleton.vue
app/assets/print.css
tests/unit/signature-pad.test.ts
tests/unit/table-skeleton.test.ts
agents/decisions/ADR-0026-design-system-polish.md
agents/handoffs/2026-05-15-W2-6-design-polish.md  (this file)
```

## Files modified (10)

```
nuxt.config.ts                                  +1 css entry (print.css)
app/layouts/default.vue                         skip-link, main id, no-print
app/components/nav/AppSidebar.vue               BulwarkIcon adoption
app/components/nav/AppTopBar.vue                BulwarkIcon adoption + aria-label
app/components/nav/AppBottomNav.vue             BulwarkIcon adoption
app/components/nav/UserMenu.vue                 BulwarkIcon adoption + aria-label
app/pages/settings/index.vue                    icon column added
app/pages/admin/properties/index.vue            BulwarkTableSkeleton wired
app/pages/admin/quotes/index.vue                BulwarkTableSkeleton wired
app/pages/admin/work-orders/index.vue           BulwarkTableSkeleton wired
shared/nav/nav.config.ts                        4 icon name remaps
tests/unit/bulwark-icon.test.ts                 fix import path
```

---

## Deferred glyphs (W3-1 sprite expansion)

Glyphs that were referenced in `nav.config.ts` but missing from the
sprite — remapped to existing names in W2-6, candidates for genuine
addition in W3-1:

- `sun` — desired for field "Today" dashboard (currently uses `clock`).
- `document` — generic document glyph distinct from `file-text`.
- `receipt` — invoice surfaces (currently `dollar-sign`).
- `cog` — historical alias for `settings`.

No inline `<svg>` blocks in `app/**` referenced glyphs missing from the
sprite. (The only `<svg>` is inside `BulwarkIcon.vue` itself.)

## Pages with skeletons wired (3)

- `/admin/properties` — 8-row × 4-col skeleton (`data-testid="properties-loading"`)
- `/admin/quotes`     — 6-row × 4-col skeleton (`data-testid="quotes-loading"`)
- `/admin/work-orders`— 6-row × 4-col skeleton (`data-testid="work-orders-loading"`)

## Remaining adoption surfaces (deferred)

These pages have no inline `<svg>` and already render fine with the
adopted chrome (sidebar + topbar icons). Adoption pass when a real
visual need surfaces:

- `app/pages/admin/properties/[id]/index.vue` (tabbed overview)
- `app/pages/admin/work-orders/[id].vue`
- `app/pages/admin/invoices/index.vue`, `app/pages/admin/invoices/[id].vue`
- `app/pages/admin/clients/`, `app/pages/admin/subcontractors/`
- `app/pages/admin/dispatch.vue`
- `app/components/ui/StatusBadge.vue` (currently text-only pill — no
  icon yet, no change needed in W2-6)
- `app/components/compliance/SignaturePad.vue` (migration to
  `BulwarkSignaturePad` — see ADR-0026 §Deferred)
- `app/components/inspections/InspectionForm.vue` (uses legacy
  `SignaturePad` modal — defer with compliance migration)

---

## Verification

```
pnpm exec vitest run tests/unit
  → 24 files, 144 tests passed (4.0s)

pnpm typecheck
  → Pre-existing errors only (server/services/*.ts row-mappers,
    auth.real.ts, property.real.ts; shared/mocks/* missing files;
    app/pages/admin/quotes/index.vue unused declarations).
    No NEW errors introduced by W2-6.

pnpm exec playwright test tests/e2e/settings-matrix.spec.ts \
  --project=chromium
  → BLOCKED in local environment by a pre-existing db-seed.mjs FK
    constraint violation (programs ← inspection_templates) at
    global-setup.ts:29. NOT caused by W2-6 — this slice does not
    touch DB schemas, migrations, seed scripts, or services. DB
    reset (`pnpm db:reset`) also fails on the same constraint, so
    the local DB needs an out-of-band wipe before the e2e suite
    can run again. Flagged for infrastructure follow-up.
```

## Hard-constraint compliance

- [x] No changes under `/demo/`.
- [x] No business-logic / contract / schema / service changes.
- [x] No existing component renames or public-prop changes.
- [x] No new e2e selector breaks (skeletons added as new `*-loading`
      testids; empty-state testids preserved).
- [x] No new dep packages.
- [x] All new files ≥40 LOC carry rich-comment header.
- [x] Unit tests pass (144/144).
- [x] No new typecheck errors introduced.

---

End of handoff.
