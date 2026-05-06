# Epic E14 — Admin Surface Polish

> **Phase**: 1.5 (post-E11) | **Build order**: 14th | **Depends on**: E3, E5, E6, E7, E8, E11
>
> Captures gaps surfaced by the **2026-05-06 admin audit**. None of these
> are net-new domains — they're missing affordances on already-shipped
> surfaces. Split out from the epic that owns the underlying domain so
> we don't re-open closed epics.

## Objective

Close the "the page works but I can't get into it" gaps in the admin
surfaces. Audit found three categories:

1. **Dead nav links** — fixed in this epic's first commit (E14-S1).
2. **Scoped-only create flows** — quotes, work orders, invoices are
   intentionally created from their parent (Property → Quote → WO →
   Invoice), but the org-wide list pages should at least *direct* the
   user to the right starting point. Today they show empty-state copy
   that doesn't explain the chain.
3. **Read-only detail pages with no edit affordance** — clients have a
   detail page but no "+ New" or edit form; subcontractors edit but
   no create.

## In Scope

- Org-wide compliance list page (the dead `/admin/compliance` link).
- Top-level "+ New" affordances on the org-wide quotes / WO / invoices
  index pages that route the user to the correct parent picker.
- Client create + edit forms (today: list + read-only detail only).
- Subcontractor create form (today: list + edit-only detail).
- Property detail tabs that are placeholders today: photos (E4-deferred)
  and notes (E10-deferred). These stay deferred but get explicit
  "coming in E14-S6/S7" stub copy so they don't look broken.

## Out of Scope

- Settings honest stubs (company / users / feature-flags / catalog /
  templates) — those are tracked under E9 + E11 already and have
  "coming soon" copy that's accurate.
- Subcontractor → trade-slot assignment (E6-S3).
- Bulk operations of any kind. No customer demand yet.

## Stories

| ID | Title | Visible delta | Status |
|---|---|---|---|
| E14-S1 | Drop dead `/admin/pipeline` nav link + ship `/admin/compliance` org-wide list | sidebar links resolve | ✅ Done (2026-05-06) |
| E14-S2 | Top-level "+ New quote" CTA on `/admin/quotes` → property picker → quote builder | sponsor can start a quote without first navigating to a property | ✅ Done (2026-05-06) |
| E14-S3 | Top-level "+ New work order" CTA on `/admin/work-orders` → accepted-quote picker → WO builder | same chain shortcut for WOs | ✅ Done (2026-05-06) |
| E14-S4 | Top-level "+ New invoice" CTA on `/admin/invoices` → completed-WO picker → invoice builder | same chain shortcut for invoices | ✅ Done (2026-05-06) |
| E14-S5 | Client create form on `/admin/clients/new` (edit deferred — contract has no `update`) | client onboarding without going through property intake | ✅ Done (2026-05-06) |
| E14-S6 | Subcontractor create form on `/admin/subcontractors/new` (contract + mock + real `create()` added) | sponsor can onboard a sub without seed data | ✅ Done (2026-05-06) |
| E14-S7 | Property detail "Photos" tab — explicit "Photos land in Epic E4" stub copy | tab no longer feels broken | ✅ Done (2026-05-06) |
| E14-S8 | Property detail "Notes" tab — explicit "Internal notes land in Epic E10" stub | same | ✅ Done (2026-05-06) |
| E14-S9 | **Playwright** — happy path through the new top-level "+ New" affordances | green spec | ✅ Done (2026-05-06) |

## Audit Findings — Reference

The full audit lives in the 2026-05-06 conversation transcript. Summary:

**Truly broken (404 / dead links):**
- `/admin/pipeline` — never existed; kanban is on `/admin/properties`. *Fix: drop nav row.*
- `/admin/compliance` — page never existed. *Fix: ship a list page that links into the property-scoped detail.*

**Scoped create chain (working but UX-rough):**
- `/admin/quotes`, `/admin/work-orders`, `/admin/invoices` — index pages have no "+ New" because creates are scoped (Quote needs a Property, WO needs an accepted Quote, Invoice needs a completed WO). The chain is BRD-correct but the index pages don't help the user start. *Fix: each gets a "+ New" that opens a parent picker.*

**Read-only detail with no create:**
- `/admin/clients` — list + detail exist; no create, no edit. *Fix: E14-S5.*
- `/admin/subcontractors` — list + edit exist; no create. *Fix: E14-S6.*

**Honest stubs (already tracked, not in this epic):**
- `/settings/company` — backend mutation lands in E11 follow-up.
- `/settings/users` — invite flow lands in E11 follow-up.
- `/settings/feature-flags` — service mutation lands in E11 follow-up.
- `/settings/catalog`, `/settings/templates` — design stubs in E9; PDF
  template renderer needs E11 backend.

**Auth flows:**
- ✅ Verified end-to-end: login → session → role gating, logout,
  forgot-password → reset, invite acceptance, `/403` on wrong role,
  `auth.global.ts` middleware whitelist correct.

## Approval Status

🟢 **All 9 stories shipped 2026-05-06.** Epic complete.
