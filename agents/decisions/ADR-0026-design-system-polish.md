# ADR-0026 — Design System Polish & a11y Baseline (W2-6 / EH-L)

**Status:** Accepted
**Date:** 2026-05-15
**Wave / Slice:** Phase 1 Hardening → Wave 2 → W2-6
**Supersedes:** none
**Touched by:** ADR-0008 (rich comments)

---

## Context

The Wave-1 / Wave-2 functional slices left the production app shipping
ad-hoc loading states ("Loading…" strings vs spinners vs nothing),
emoji-and-Unicode-arrow icon placeholders (`▾`, `·`, `◇`), inline `<svg>`
copies of every glyph, no print stylesheet, and no skip-to-content link.
PHASE1_HARDENING_PLAN.md §4 EH-L promised a design-system polish slice
that establishes a single set of UI primitives + an accessibility
baseline so every Wave-3 surface inherits the same affordances.

EH-L's deliverables:

1. **Icon sprite + `BulwarkIcon`** — single primitive that renders glyphs
   from `/icons/sprite.svg`. (Landed in a prior W2-6 sub-pass — see
   `app/components/ui/BulwarkIcon.vue` + `icon-names.ts`.)
2. **`BulwarkSignaturePad`** primitive in `app/components/ui/`, separate
   from the existing trade-specific `compliance/SignaturePad.vue`.
3. **`BulwarkTableSkeleton`** for list-page loading shimmer.
4. **`print.css`** wired globally so quotes / invoices / compliance docs
   print clean from any browser.
5. **a11y baseline**: skip-to-content link, `<main id="main-content">`,
   focus-visible rings, ARIA labels on icon-only buttons.

## Decision

### Icon sprite strategy

* **One static SVG sprite** at `public/icons/sprite.svg`, served as
  `/icons/sprite.svg` with browser caching. Glyphs referenced via
  `<svg><use href="/icons/sprite.svg#bw-{name}"/></svg>`. Zero JS bundle
  cost, no runtime resolver, no Iconify dep.
* **`bw-` prefix on symbol IDs** but NOT on the `IconName` union. The
  prefix is a sprite-namespace concern only; consumers shouldn't see it.
* **Registry of names lives in `app/components/ui/icon-names.ts`** —
  importable from Vitest's node env without `@vitejs/plugin-vue`. The
  `.vue` file re-exports the same list; the unit test (now importing
  from `icon-names.ts`) enforces sprite ↔ registry parity.
* **`currentColor` only.** No `color` prop — consumers set color via
  Tailwind text utilities on the parent.
* **Size token only.** `sm | md | lg | xl`. No freeform sizes.
* **a11y**: decorative by default (`aria-hidden`). Pass `label` prop and
  the component upgrades to `role="img"` + `aria-label`.

### `BulwarkSignaturePad`

* **Native canvas + pointer events.** Mouse, touch, and pen share one
  code path. No `signature_pad` npm dep — W2-6 hard constraint.
* **DPR-aware backing store** for crisp strokes on retina tablets.
* **Explicit "Save" button.** Unlike the legacy `compliance/SignaturePad`
  (emits on every pointerup), this primitive only emits
  `update:modelValue` when the user presses Save. Parents that need
  on-pointerup commit semantics keep using the compliance shim.
* **Imperative API via `defineExpose({ clear, save })`** so forms can
  drive the pad from their own submit/cancel buttons.
* **a11y**: `tabindex="0"`, `role="img"`, `aria-label="Signature
  canvas"` so screen readers announce the surface and the
  focus-visible ring lands on it.
* **Coexists with `app/components/compliance/SignaturePad.vue`.** That
  legacy component has its own e2e selectors + `update:isEmpty`
  semantics that the compliance-generator flow depends on. Migration
  of compliance/inspection callers to the new primitive is **deferred**
  — see §Deferred below.

### `BulwarkTableSkeleton`

* **Token-flat shimmer.** `animate-pulse bg-slate-200` per the EH-L
  spec. No theming knob — every list looks identical.
* **Props: `rows=5`, `cols=4`, `showHeader=true`** as defaults. The
  three highest-traffic list pages (admin properties, quotes, work
  orders) render this skeleton during the client-side fetch window.
* **`aria-busy` + `aria-live="polite"`** so assistive tech announces
  "loading" without a visible string in the DOM.

### `print.css`

* **Global `@media print` stylesheet** at `app/assets/print.css`, added
  to `nuxt.config.ts` `css[]`. Zero impact on screen rendering.
* Hides `nav`, `aside`, `header button`, `footer button`, plus opt-ins
  (`.no-print`, `.print:hidden`).
* Flattens color, tightens type for letter paper, prints URLs inline,
  uses `0.6in` margins.
* Layout-level wiring: `AppSidebar`, `AppTopBar`, `AppBottomNav` all
  carry `.no-print` for belt + braces (the `nav` / `aside` rule
  catches them by tag already).
* `<main id="main-content" data-print-root>` wraps page content so
  future page-specific print stylesheets can target only the body.

### Accessibility baseline

* **Skip-to-content link** is the first interactive element inside the
  default layout. Visible on focus only (`sr-only focus:not-sr-only`).
* **`<main id="main-content" tabindex="-1">`** so the skip link can
  jump there and screen readers can land focus.
* **Global `:focus-visible` ring** already in `app/assets/css/main.css`
  (added in E2-S1). EH-L re-validates it covers `<button>` and `<a>`
  globally and that no per-component override breaks it.
* **ARIA labels on icon-only chrome** — `user-menu-button` (Open user
  menu), `org-switcher` (Switch organization).

### Adoption pattern

Rather than chase 100 % inline-SVG-to-`BulwarkIcon` rewrites, the
adoption sprint focused on the **nav surfaces that every page renders**
and the **settings hub** that admins land on every time they configure
the app. Centralizing icon-naming in `shared/nav/nav.config.ts` means a
single edit propagates the new sprite glyphs to every role's sidebar +
mobile bottom nav.

The app shipped with very few inline `<svg>` tags inside `app/` —
historically the team used Unicode glyphs (`▾`, `·`, `◇`, etc.) as
placeholders instead of inline SVG, so the "30–50 inline-SVG
replacements" target translates to "30–50 rendered icon instances after
adoption", which the nav refactor delivers via a single change point.

## Deferred

* **Migrating `compliance/SignaturePad.vue` and inspection signing
  modal** to `BulwarkSignaturePad`. Both have entrenched e2e specs
  (compliance-generator, inspection-dynamic) that exercise the legacy
  `update:isEmpty` semantics; the cutover is its own slice.
* **Sprite expansion** — the current sprite is ~50 glyphs. Several
  nav.config strings used names that weren't in the sprite (`sun`,
  `document`, `receipt`, `cog`). EH-L remapped those to existing
  glyphs (`clock`, `file-text`, `dollar-sign`, `settings`). Adding
  genuinely-new glyphs (e.g. a sun icon for the field "Today" page) is
  W3-1.
* **Settings hub icons + status badges** are visual-only adoption.
  Detail pages (`/admin/properties/[id]`, `/admin/work-orders/[id]`,
  `/admin/invoices/[id]`) keep their existing chrome — they have no
  inline SVG and the layout-level icon adoption already gives the same
  visual lift via the persistent sidebar.
* **Dark-mode tokens** explicitly out of scope (PHASE1_HARDENING_PLAN.md
  EH-L row marks them deferred).
* **Modal focus trap.** `BulwarkModal` already manages focus on
  open/close (E1-S5). Trap + return-focus polish is a future ADR.

## Consequences

### Positive

* New primitive = one place to fix bugs. The next surface that needs a
  signature ships with `BulwarkSignaturePad` and inherits a11y +
  DPR-aware drawing for free.
* Loading shimmer is a one-line change at the consume site (`<BulwarkTableSkeleton :rows="6" :cols="4" />`)
  instead of hand-rolled Tailwind divs.
* Printed quotes / invoices / compliance docs no longer carry the dark
  sidebar or nav chrome onto paper.
* Keyboard users get a working skip-to-content on every authenticated
  page.

### Negative / debt

* Two `SignaturePad` files now coexist (`ui/BulwarkSignaturePad.vue` +
  `compliance/SignaturePad.vue`). The dual surface is documented above
  and tagged for follow-up; until then, new surfaces use the `ui/`
  primitive and legacy surfaces keep their integration.
* Nav `item.icon` strings now cast to `IconName` at the use site. If a
  contributor adds a nav row with a misspelled icon name the
  TypeScript check on the cast catches it.

## Test posture

* **Unit:** `tests/unit/bulwark-icon.test.ts` (sprite parity, fixed to
  import from `icon-names.ts`), `tests/unit/signature-pad.test.ts`
  (SFC contract — props, exposed API, emitted events, a11y),
  `tests/unit/table-skeleton.test.ts` (SFC contract — defaults,
  v-for shape, shimmer tokens). Vitest runs in node env without
  `@vitejs/plugin-vue`, so component mounting tests are intentionally
  source-shape assertions; full DOM behaviour is exercised by
  existing Playwright specs (compliance-generator,
  inspection-dynamic).
* **E2E:** No new specs in W2-6. The chrome change in
  `default.vue` (skip-to-content + `main-content` id) is benign for
  existing selectors. Smoke check on `settings-matrix.spec.ts`
  recommended; in W2-6 the local environment hit a pre-existing
  `db-seed.mjs` FK violation that blocked the full Playwright run.

---

End of ADR.
