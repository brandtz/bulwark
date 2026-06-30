# L09 — Accessibility (WCAG 2.1 AA)

> **Phase:** A (Wave 3) · **Autonomy:** AUTO · **Depends on:** —
> **Owns gap-register:** §3.8.1–3.8.3 · **Decision:** ADR-0008

## Purpose
The launch gate requires WCAG 2.1 AA. There is a concrete navigation bug (field
layout "Photos"/"Notes" tabs route to the wrong page), no automated a11y gate, and
unverified focus/aria coverage and async-error affordances. This epic fixes the bug,
adds an axe-core CI gate, and performs a focus/aria sweep of the primary flows.

## Key decisions (ADR-0008)
- `@axe-core/playwright` runs on a representative route per surface in CI; **zero
  serious/critical violations** is a merge gate.
- Manual keyboard pass on the top flows (login, property intake, quote build, invoice,
  field check-in, homeowner/sub/insurer landing) documented in `docs/A11Y.md`.

## Stories

### L09-S1 — Fix field layout tab routing (functional a11y bug)
- **Client:** `app/layouts/field.vue` — today **three** tabs (Inspect, Photos, Notes) all point
  at `/field/check-in` and the `photos`/`notes` destination pages don't exist. Route "Inspect"
  → job inspect; build (or hide until built) the Photos + Notes destinations; tabs use real
  `aria-current`.
- **Tests:** e2e — each visible field tab lands on its intended page; no tab is a dead/duplicate
  link; `aria-current` reflects the active tab.

### L09-S2 — axe-core CI gate
- **Tests:** `tests/e2e/a11y.spec.ts` — run axe on one route per surface (admin list, admin
  detail, settings, field, sub, homeowner, insurer, login, error); fail on serious/critical.
- **CI:** add to the Playwright job.
- **Acceptance:** a11y spec green; a seeded violation fails CI.

### L09-S3 — Focus management + skip links + landmarks sweep
- **Client:** verify skip-to-content, single `<main id>`, focus moves to headings on route
  change, modals trap+restore focus, drawers/menus are escape-closable and focus-safe.
- **Tests:** e2e — modal focus trap + restore; route-change focus; keyboard-only nav of the
  primary flow.

### L09-S4 — Forms, contrast, and async-error affordances
- **Client:** every input has a programmatic label + error association (`aria-describedby`);
  status uses text/icon not color alone; add visible error + **retry** to the three flagged
  async actions (profile avatar, sub COI upload, user invite).
- **Tests:** e2e — submit an invalid form → error announced + associated; forced failure on
  the three actions shows an error with a working retry.
- **Acceptance:** axe clean + manual keyboard pass documented in `docs/A11Y.md`.
