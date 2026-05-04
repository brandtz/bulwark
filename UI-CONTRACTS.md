# Bulwark — UI Component Contracts

> **Status**: Skeleton landed in E0-S1. Component-by-component filled out in E1.
>
> This file documents the **public prop / event / slot surface** of every
> reusable component in `app/components/ui/` and `app/components/nav/`. It is
> the contract the rest of the app codes against.

---

## Why this file exists

In the demo, sidebar markup was duplicated across pages. Each copy drifted.
For the real app, components have a single declared surface; usage outside
that surface fails typecheck.

This document is to UI components what [CONTRACTS.md](CONTRACTS.md) is to
services.

---

## Naming

- Components: `PascalCase.vue` (e.g. `BulwarkButton.vue`, `StatusBadge.vue`)
- Prop types: `<ComponentName>Props` exported from the same file
- Emit names: kebab-case (e.g. `update:modelValue`, `select`, `dismiss`)

---

## Primitive Library Index (filled out in E1)

> **Status — E1-S2 shipped (2026-04-?? · commit pending):** All Form / Display / Overlay
> primitives below are implemented in `app/components/ui/` and rendered on `/dev/ui`,
> with Playwright coverage in [tests/e2e/ui-primitives.spec.ts](tests/e2e/ui-primitives.spec.ts).
> An `update:modelValue` row WITHOUT a corresponding component file is a review defect.

### Form primitives

| Component | Props | Emits | Slots |
|---|---|---|---|
| `BulwarkButton` | `variant: 'primary'\|'secondary'\|'ghost'\|'destructive'`, `size: 'sm'\|'md'\|'lg'`, `loading?`, `disabled?`, `iconLeft?`, `iconRight?` | `click` | default |
| `BulwarkInput` | `modelValue`, `label`, `placeholder?`, `error?`, `required?`, `type: 'text'\|'email'\|'tel'\|'password'\|'number'`, `disabled?` | `update:modelValue`, `blur` | — |
| `BulwarkTextarea` | `modelValue`, `label`, `error?`, `rows?` | `update:modelValue` | — |
| `BulwarkSelect` | `modelValue`, `label`, `options: {value,label}[]`, `placeholder?`, `error?` | `update:modelValue` | — |
| `BulwarkMultiSelect` | `modelValue: string[]`, `options`, `label`, `error?` | `update:modelValue` | — |
| `BulwarkToggle` | `modelValue: boolean`, `label`, `description?` | `update:modelValue` | — |
| `BulwarkPassFailToggle` | `modelValue: 'pass'\|'fail'\|'na'\|null`, `label`, `allowNa?: boolean` | `update:modelValue` | — |
| `BulwarkDatePicker` | `modelValue: string\|null`, `label`, `min?`, `max?`, `error?` | `update:modelValue` | — |
| `BulwarkSegmentedControl` | `modelValue`, `options: {value,label,icon?}[]` | `update:modelValue` | — |
| `BulwarkSearchField` | `modelValue`, `placeholder?`, `debounceMs?` | `update:modelValue` | — |
| `BulwarkFilePicker` | `modelValue: File[]`, `accept?`, `multiple?`, `maxSizeMB?` | `update:modelValue` | — |

### Display primitives

| Component | Props | Slots |
|---|---|---|
| `BulwarkCard` | `padding?: 'sm'\|'md'\|'lg'`, `clickable?` | default, `header`, `footer` |
| `BulwarkKpiCard` | `label`, `value`, `delta?`, `deltaDirection?`, `to?`, `tone?: 'default'\|'warning'\|'error'` | — |
| `BulwarkJobCard` | `address`, `status`, `time?`, `scope?`, `to?` | actions |
| `StatusBadge` | `status: PropertyStatus\|QuoteStatus\|WorkOrderStatus\|InvoiceStatus\|ComplianceStatus`, `size?: 'sm'\|'md'` | — |
| `BulwarkAvatar` | `name`, `src?`, `size?: 'sm'\|'md'\|'lg'` | — |
| `EmptyState` | `icon`, `title`, `body?`, `cta?: {label, to}` | — |
| `BulwarkSkeleton` | `variant: 'text'\|'card'\|'avatar'`, `lines?` | — |
| `BulwarkPagination` | `page`, `pageSize`, `total` | — |
| `BulwarkBreadcrumbs` | `items: {label, to?}[]` | — |

### Overlay primitives

| Component | Props | Emits | Slots |
|---|---|---|---|
| `BulwarkModal` | `modelValue: boolean`, `title`, `size?: 'sm'\|'md'\|'lg'\|'xl'`, `dismissible?` | `update:modelValue`, `confirm`, `cancel` | default, `footer` |
| `BulwarkDrawer` | `modelValue`, `side: 'right'\|'bottom'` | `update:modelValue` | default |
| `BulwarkTabs` | `modelValue`, `tabs: {value, label, count?}[]` | `update:modelValue` | per-tab `#tab-<value>` |
| `BulwarkStepper` | `currentStep`, `steps: {label, status}[]` | — | — |
| `BulwarkToast` (imperative — `useToast()`) | — | — | — |

### Navigation components (`app/components/nav/`)

| Component | Owns |
|---|---|
| `AppSidebar` | desktop dark sidebar (>=768px); reads `nav.config.ts` filtered by role |
| `AppBottomNav` | mobile bottom nav (<768px); same source |
| `AppTopBar` | breadcrumbs, org switcher, user menu, global search slot |
| `OrgSwitcher` | dropdown for super_admin + multi-org users |
| `UserMenu` | avatar dropdown — Profile, Notifications, Sign Out |
| `RolePillDev` | dev-only floating role switcher (matches the demo's pill) |

These are the **only** components allowed to render persistent app chrome.
ADR-0005 forbids any other file from rendering a sidebar/topbar/bottom-nav.

---

## Style guide alignment

Every primitive's visual surface is grounded in [BULWARK_STYLE_GUIDE.md](docs/BULWARK_STYLE_GUIDE.md):

- Color: `app/assets/css/tokens.css` — direct port of STYLE_GUIDE §2
- Type scale: STYLE_GUIDE §3 (Tailwind config)
- Spacing: STYLE_GUIDE §4 (Tailwind config)
- Buttons / inputs / cards: STYLE_GUIDE §6
- Status badges: STYLE_GUIDE §2.4 — the StatusBadge component is the only
  rendering surface; ad-hoc colored pills are forbidden

Hex colors outside `tokens.css` fail the lint (E0-S8).

---

## Filling this document

Each component story in E1 updates this file. Adding a prop without updating
this row is a review defect.
