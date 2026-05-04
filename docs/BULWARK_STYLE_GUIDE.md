# BULWARK — Design System & Style Guide
> Version 1.1 | Originally derived from the 23-screen UX specification; now applies across the full screen catalog
> For use by agents, developers, and wireframing tools
> Brandtworks-Enterprises LLC
>
> The design tokens, component patterns, and color/typography decisions in this document apply to **every** screen in Bulwark across every user system. The canonical screen inventory lives in `BULWARK_SCREENS_BY_ROLE.md`.

---

## 1. Design Philosophy

Bulwark is a field-operations-first application. Every design decision prioritizes:

- **Outdoor readability** — high contrast, large text, no thin hairline elements
- **Gloved-hand usability** — generous tap targets, no precision interactions
- **One-handed operation** — primary actions reachable by thumb on mobile
- **Speed over aesthetics** — fast load, instant feedback, no decorative animations
- **Trust and compliance** — professional, clean, institutional feel appropriate for legal documents and inspections

---

## 2. Color System

### 2.1 Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#1d4ed8` | Primary buttons, active states, links, accent elements |
| `--color-primary-hover` | `#1e40af` | Primary button hover state |
| `--color-primary-light` | `#dbeafe` | Primary tinted backgrounds (selected rows, active pills) |

### 2.2 Neutral Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-background` | `#f8fafc` | Page background (light mode) |
| `--color-surface` | `#ffffff` | Cards, modals, form containers |
| `--color-sidebar` | `#0f172a` | Desktop sidebar background |
| `--color-sidebar-text` | `#e2e8f0` | Sidebar label text |
| `--color-sidebar-active` | `#1e293b` | Sidebar active item background |
| `--color-border` | `#e2e8f0` | Default borders, dividers |
| `--color-border-focus` | `#1d4ed8` | Focused input border |
| `--color-text-primary` | `#0f172a` | Headings, primary body text |
| `--color-text-secondary` | `#64748b` | Secondary text, captions, timestamps |
| `--color-text-disabled` | `#94a3b8` | Disabled text, placeholder text |

### 2.3 Semantic / Status Colors

These are used consistently across every screen for status badges (FT-16), toasts (FT-19), and conditional highlights.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-success` | `#16a34a` | Accepted, Compliant, Complete, Paid, success toasts |
| `--color-success-light` | `#dcfce7` | Success badge backgrounds |
| `--color-success-dark` | `#15803d` | Complete / Paid badge variant |
| `--color-warning` | `#d97706` | In Progress, Active, Amber highlights, warning toasts |
| `--color-warning-light` | `#fef3c7` | Warning badge backgrounds |
| `--color-error` | `#dc2626` | Declined, Non-Compliant, Overdue, Blocked, error toasts |
| `--color-error-light` | `#fee2e2` | Error badge backgrounds, destructive button hover |
| `--color-info` | `#2563eb` | Contacted, Pending, Scheduled, info toasts |
| `--color-info-light` | `#dbeafe` | Info badge backgrounds |
| `--color-purple` | `#7c3aed` | Quoted, Scheduled badge variant |
| `--color-purple-light` | `#ede9fe` | Purple badge background |
| `--color-blocked` | `#ea580c` | Blocked status, alert banners |
| `--color-blocked-light` | `#fff7ed` | Blocked banner background |

### 2.4 Status Badge Color Map

This mapping is absolute and used identically across every screen:

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Lead / Draft | `#f1f5f9` | `#475569` | `#cbd5e1` |
| Contacted / Pending | `#dbeafe` | `#1d4ed8` | `#93c5fd` |
| In Progress / Active | `#fef3c7` | `#d97706` | `#fcd34d` |
| Quoted / Scheduled | `#ede9fe` | `#7c3aed` | `#c4b5fd` |
| Accepted / Compliant | `#dcfce7` | `#16a34a` | `#86efac` |
| Declined / Non-Compliant / Overdue | `#fee2e2` | `#dc2626` | `#fca5a5` |
| Complete / Paid | `#d1fae5` | `#15803d` | `#6ee7b7` |
| Blocked | `#fff7ed` | `#ea580c` | `#fdba74` |

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Fallback |
|------|------|----------|
| All UI text | Inter | system-ui, -apple-system, sans-serif |

Inter is used for everything — headings, body, labels, buttons, data tables. No secondary display font. The application is a workhorse tool, not a marketing site.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-display` | 24px / 1.5rem | 700 (Bold) | 1.2 | Page titles, greeting headers |
| `--text-heading` | 20px / 1.25rem | 600 (Semibold) | 1.3 | Section headings, card group titles |
| `--text-subheading` | 16px / 1rem | 600 (Semibold) | 1.4 | Sub-section titles, field group labels |
| `--text-body` | 14px / 0.875rem | 400 (Regular) | 1.5 | Primary body text, form labels, table cells |
| `--text-body-strong` | 14px / 0.875rem | 600 (Semibold) | 1.5 | Emphasized body text, addresses in cards |
| `--text-small` | 12px / 0.75rem | 400 (Regular) | 1.4 | Timestamps, captions, helper text, badge labels |
| `--text-tiny` | 11px / 0.6875rem | 500 (Medium) | 1.3 | Status badge text, pill labels |

### 3.3 Typography Rules

- Minimum body text on mobile: 14px. Never go below 12px for any visible text.
- Headings never use light or thin weights — outdoor readability requires 600+.
- No italic text in field-facing screens. Italic is only used in admin/settings for placeholder hints.
- No all-caps except for status badge labels and navigation section headers (and those are letter-spaced at +0.05em).
- Line length maximum: 72ch for body text containers.

---

## 4. Spacing System

Based on a 4px base unit. All spacing uses multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight inline gaps, icon-to-label gap |
| `--space-sm` | 8px | Inner padding on badges, between inline elements |
| `--space-md` | 12px | Input internal padding, card content gaps |
| `--space-base` | 16px | Standard padding, section gaps, card padding |
| `--space-lg` | 20px | Between card groups, before section headings |
| `--space-xl` | 24px | Page-level padding (mobile), major section breaks |
| `--space-2xl` | 32px | Page-level padding (desktop), large section gaps |
| `--space-3xl` | 48px | Between major page regions |

### 4.1 Page Margins

| Viewport | Horizontal Padding | Top Padding |
|----------|--------------------|-------------|
| Mobile (<768px) | 16px | 16px |
| Tablet (768–1279px) | 24px | 20px |
| Desktop (1280px+) | 32px (content area only, sidebar excluded) | 24px |

---

## 5. Layout & Responsive Breakpoints

### 5.1 Breakpoints

| Name | Width | Navigation | Layout |
|------|-------|------------|--------|
| Mobile | <768px | Bottom tab bar (fixed) | Single column, stacked |
| Tablet | 768–1279px | Bottom tab bar or sidebar (context-dependent) | Two-column where beneficial |
| Desktop | 1280px+ | Fixed left sidebar (collapsible) | Multi-column, data tables |

### 5.2 Mobile Navigation Shell

- **Position:** Fixed bottom bar, always visible
- **Height:** 64px
- **Background:** `#ffffff` with top border `1px solid #e2e8f0`
- **Tabs (5 max):** Home, Properties, Jobs, Quotes, Menu (overflow)
- **Active state:** Filled icon + `--color-primary` label
- **Inactive state:** Outline icon + `--color-text-secondary` label
- **FAB (Floating Action Button):** Centered, 56px diameter, `--color-primary`, white `+` icon, elevated with shadow

### 5.3 Desktop Navigation Shell

- **Position:** Fixed left sidebar
- **Width:** 240px expanded / 64px collapsed (icon-only)
- **Background:** `--color-sidebar` (#0f172a)
- **Text:** `--color-sidebar-text` (#e2e8f0)
- **Active item:** `--color-sidebar-active` (#1e293b) background, white text, left 3px accent border `--color-primary`
- **Sections:** Dashboard, Properties (sub: All, Pipeline), Work Orders, Quotes, Compliance Docs, Invoices, Subcontractors, Settings
- **Top bar:** Breadcrumb nav center, user avatar + name right with dropdown (Profile, Sign Out)

### 5.4 Content Width

| Context | Max Width |
|---------|-----------|
| Form screens | 640px centered |
| Dashboard / data screens | 100% of content area |
| Detail screens (split view) | Left panel 60%, right panel 40% |
| Tables | 100% with horizontal scroll if needed |

---

## 6. Component Library

### 6.1 Buttons

#### Primary Button
- Background: `--color-primary`
- Text: `#ffffff`, 14px, 600 weight
- Padding: 12px vertical, 24px horizontal
- Border radius: 8px
- Height: minimum 48px (mobile tap target compliance)
- Full width on mobile form screens
- Hover: `--color-primary-hover`
- Disabled: opacity 0.5, cursor not-allowed
- Loading: spinner replaces text, button disabled

#### Secondary Button
- Background: `#ffffff`
- Border: 1px solid `--color-border`
- Text: `--color-text-primary`, 14px, 500 weight
- Same dimensions as primary
- Hover: background `#f8fafc`

#### Destructive Button
- Background: `--color-error`
- Text: `#ffffff`
- Used only inside confirmation modals (FT-18)
- Never appears as a standalone page action

#### Ghost / Text Button
- Background: transparent
- Text: `--color-primary`, 14px, 500 weight
- Padding: 8px horizontal
- Used for secondary actions: "Cancel", "View All", "Forgot Password?"

#### Quick Action Button (Field Dashboard)
- Height: minimum 80px
- Full width or 50% in 2×2 grid
- Background: `#ffffff`
- Border: 1px solid `--color-border`
- Icon above label, centered
- Border radius: 12px
- Active/pressed: scale(0.98) transform

### 6.2 Form Inputs

All form inputs follow the Field Type Library (FT-01 through FT-20).

#### Standard Text Input (FT-01)
- Height: 48px (mobile), 40px (desktop)
- Background: `#ffffff`
- Border: 1px solid `--color-border`
- Border radius: 8px
- Padding: 12px horizontal
- Font: 14px, 400 weight
- Placeholder: `--color-text-disabled`
- Focus: border `--color-border-focus`, ring shadow `0 0 0 3px rgba(29,78,216,0.1)`
- Error: border `--color-error`, helper text below in `--color-error` at 12px
- Required: red asterisk (*) after label
- Label: above input, 14px, 500 weight, `--color-text-primary`

#### Textarea (FT-02)
- Same styling as text input
- Minimum height: 100px
- Resize: vertical only

#### Toggle / Switch (FT-05)
- Minimum height: 56px (entire row including label)
- Track: 48px wide, 28px tall
- Active: `--color-primary`
- Inactive: `#cbd5e1`

#### Dropdown Select (FT-09)
- Same styling as text input with chevron icon right
- Mobile: opens native select or bottom sheet
- Desktop: opens popover dropdown

#### Date Picker (FT-07)
- Input displays formatted date (MM/DD/YYYY)
- Calendar icon right
- Mobile: native date picker
- Desktop: popover calendar widget

### 6.3 Cards

#### Standard Card
- Background: `#ffffff`
- Border: 1px solid `--color-border`
- Border radius: 12px
- Padding: 16px
- Shadow: `0 1px 3px rgba(0,0,0,0.04)` (subtle, not dramatic)
- Hover (if tappable): shadow `0 2px 8px rgba(0,0,0,0.08)`, border `--color-border-focus`

#### Job Card (Field Dashboard, Pipeline)
- Left border: 4px solid, color by status:
  - Amber: In Progress
  - Blue: Scheduled
  - Red: Blocked
  - Green: Complete
- Content: address (bold), status badge, time, scope
- Actions: context-dependent buttons below content

#### KPI Card (Admin Dashboard)
- Fixed grid: 4 across on desktop, 2×2 on tablet, stacked on mobile
- Icon or metric label top
- Large number value: 24px, 700 weight
- Subtext: 12px, `--color-text-secondary`
- Tappable: navigates to filtered list view
- Conditional coloring: Overdue Invoices card turns red if count > 0

### 6.4 Status Badge (FT-16)

- Shape: pill / rounded rect
- Padding: 4px 10px
- Font: 11px, 500 weight, uppercase, letter-spacing 0.05em
- Border radius: 999px (full pill)
- Colors: see Section 2.4 Status Badge Color Map
- Display only — never interactive except when inside a list row (tap navigates to detail)

### 6.5 Toast / Notification (FT-19)

- Position: top of screen (mobile), bottom-right (desktop)
- Shape: rounded pill, 8px radius
- Padding: 12px 16px
- Icon left + message text
- Variants:
  - Success: green background, checkmark icon, auto-dismiss 3s
  - Error: red background, warning icon, persists until tap-dismissed
  - Info: blue background, info icon, auto-dismiss 4s
  - Warning: amber background, warning icon, persists until dismissed
- Max width: 400px
- Z-index: above everything

### 6.6 Confirmation Modal (FT-18)

- Overlay: `rgba(0,0,0,0.5)` backdrop
- Mobile: bottom sheet (slides up from bottom)
- Desktop: centered modal, max-width 480px
- Content: title (bold), description paragraph, two buttons
- Primary button: destructive action (red) or confirmation (primary blue)
- Secondary button: "Go Back" — grey outline
- Tap outside = dismiss (same as Go Back)

### 6.7 Empty State (FT-20)

- Centered in container
- Simple icon (line illustration, not photograph)
- Headline: 16px, 600 weight
- Subtext: 14px, `--color-text-secondary`
- Optional primary action button below
- Two variants:
  - True empty: "No properties yet. Add your first one to get started." + action button
  - Filtered empty: "No results match '[query]'. Try a different search." — no action button

### 6.8 Tables (Desktop)

- Full width of content area
- Header row: background `#f8fafc`, text 12px, 600 weight, uppercase, `--color-text-secondary`
- Body rows: 14px, alternating white / `#fafbfc` (subtle zebra)
- Row height: minimum 48px
- Hover: background `#f1f5f9`
- Cell padding: 12px horizontal, 10px vertical
- Sortable columns: header text + sort arrow icon
- Per-row actions: FT-17 three-dot menu at end of row

### 6.9 Pipeline / Kanban (Screen 04)

- Columns: one per pipeline stage (up to 9)
- Column header: stage name + count badge
- Horizontal scroll on mobile (snap scrolling per column)
- Cards within columns: standard card styling with status-colored left border
- Toggle: Board / List view (segmented control top)
- List view: table layout with same data, sortable columns

### 6.10 Photo Capture (FT-14)

- Tap area: large bordered dashed rectangle, 100px+ height
- Icon: camera centered
- Mobile: opens action sheet — "Take Photo" / "Choose from Library"
- Desktop: opens file picker
- After capture: thumbnail grid, each with remove (×) button
- Upload progress: bar overlay on thumbnail
- Tap thumbnail: full-size preview

### 6.11 Signature Capture (FT-15)

- Canvas area: bordered, minimum 200px height
- Prompt text: "Sign here" centered, disappears on first stroke
- Clear button below canvas
- Read-only mode: shows captured signature as static image
- Border: 2px solid `--color-border`, 8px radius

---

## 7. Iconography

- **Style:** Outline / line icons, 24px default, 2px stroke
- **Library:** Lucide Icons (consistent with the nothing. ecosystem)
- **Color:** inherits text color of context
- **Sizes:** 16px (inline), 20px (buttons), 24px (navigation), 32px (empty states)
- **Navigation icons:** Home (house), Properties (building), Jobs (clipboard), Quotes (document-dollar), Menu (grid or hamburger)
- **Action icons:** Plus, Edit (pencil), Delete (trash), Download, Upload, Filter, Sort, Search, Phone (tap-to-call), Email, Camera, Bell (notifications)

---

## 8. Elevation & Shadows

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | none | Flat elements, inline content |
| 1 | `0 1px 3px rgba(0,0,0,0.04)` | Cards, form containers |
| 2 | `0 2px 8px rgba(0,0,0,0.08)` | Hovered cards, dropdowns |
| 3 | `0 4px 16px rgba(0,0,0,0.12)` | Modals, bottom sheets, FAB |
| 4 | `0 8px 32px rgba(0,0,0,0.16)` | Overlay dialogs |

Shadows are intentionally subtle — this is a work tool, not a consumer app. No dramatic drop shadows.

---

## 9. Motion & Animation

### 9.1 General Principles

- No decorative animations on field-facing screens
- All transitions are functional: feedback for user action
- Maximum transition duration: 200ms
- Easing: `ease-out` for entrances, `ease-in` for exits

### 9.2 Specific Transitions

| Element | Transition | Duration |
|---------|-----------|----------|
| Button press | scale(0.98) | 100ms |
| Modal / bottom sheet entrance | slide up + fade | 200ms |
| Modal / bottom sheet exit | slide down + fade | 150ms |
| Toast entrance | slide in from top/right | 200ms |
| Toast exit | fade out | 150ms |
| Dropdown open | fade + scale Y from 95% | 150ms |
| Page navigation | none (instant) | 0ms |
| Tab switch | none (instant) | 0ms |
| Card hover shadow | shadow transition | 200ms |

### 9.3 Loading States

- Button loading: text replaced with spinner, button disabled
- Page loading: skeleton placeholders matching content shape
- List loading: 3-5 skeleton card outlines
- Never use full-page spinners — always show skeleton or partial content

---

## 10. Accessibility

### 10.1 Tap Targets

- Minimum tap target: 48×48px on all interactive elements
- Toggle buttons (FT-05): minimum 56px row height
- Quick action grid buttons: minimum 80px height
- Spacing between adjacent tap targets: minimum 8px

### 10.2 Contrast

- Body text on white: minimum 4.5:1 ratio (WCAG AA)
- Large text (18px+ or 14px bold): minimum 3:1
- All status badge combinations meet minimum 4.5:1
- Interactive element focus rings visible at 3:1 against background

### 10.3 Focus Management

- All interactive elements have visible focus indicators (ring shadow)
- Tab order follows visual reading order
- Modals trap focus when open
- After modal dismiss, focus returns to triggering element
- Skip-to-content link on every page (screen reader)

### 10.4 Screen Reader

- All images have alt text
- Form inputs have associated labels (not placeholder-only)
- Status badges have aria-label with full status text
- Toast notifications use aria-live="polite"
- Loading states announced via aria-busy

---

## 11. Offline & Connectivity

- **Offline banner:** amber, full width, below top bar — "Working offline — changes will sync when reconnected"
- **Online restored:** green toast — "All changes synced"
- All form inputs continue to work offline
- Data cached locally
- Sync conflict resolution: last write wins, losing user gets warning toast
- Offline indicator icon in top bar: cloud with slash icon, amber

---

## 12. PDF & Document Styling

Compliance documents, quotes, and invoices generate as PDFs with consistent styling:

- **Letterhead:** Company logo top-left, company info top-right
- **Body font:** 11pt, standard serif (Times or Georgia) for legal readability
- **Headings:** 14pt bold, `--color-primary`
- **Tables:** 1px borders, light header row shading
- **Footer:** Page numbers, generation timestamp, document reference ID
- **Signature block:** bordered area with signature image, printed name, date
- All generated PDFs include audit metadata: generated by, generated at, document version

---

## 13. Mobile-Specific Patterns

### 13.1 Bottom Sheets

Used instead of modals on mobile for: action menus (FT-17), confirmation dialogs (FT-18), filter panels, and quick-add forms.

- Slides up from bottom
- Drag handle at top (centered, 40px wide, 4px tall, rounded, grey)
- Max height: 85% of viewport
- Overlay backdrop behind
- Swipe down to dismiss

### 13.2 Horizontal Scroll

Used for: Today's Jobs cards on Field Dashboard, Pipeline columns, status pill strips.

- Snap scrolling (scroll-snap-type: x mandatory)
- Peek: always show partial next card to indicate scrollability
- No visible scrollbar on mobile
- Scroll indicators: dots or partial card peek

### 13.3 Pull-to-Refresh

- Available on all list screens
- Pull threshold: 64px
- Spinner animation during refresh
- Content pushes down during pull

### 13.4 Tap-to-Call

- Phone numbers in contact cards render as tappable links
- Opens native phone dialer
- Icon: phone icon, `--color-primary`

---

## 14. Data Formatting Conventions

| Data Type | Format | Example |
|-----------|--------|---------|
| Date | MMM DD, YYYY | Jan 15, 2026 |
| Date (compact) | MM/DD/YY | 01/15/26 |
| Time | h:mm A | 2:30 PM |
| Time ago | relative | 2h ago, Yesterday, Jan 15 |
| Currency | $X,XXX.XX | $12,450.00 |
| Phone | (XXX) XXX-XXXX | (541) 555-0123 |
| Address | Street, City, ST ZIP | 1847 Rimrock Rd, Bend, OR 97701 |
| Percentage | XX% | 75% |
| Count badges | number only | 12 |

---

## 15. Tailwind CSS Token Reference

For implementation with Tailwind CSS, map design tokens as follows:

```javascript
// tailwind.config.js extend
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1d4ed8', hover: '#1e40af', light: '#dbeafe' },
        sidebar: { DEFAULT: '#0f172a', text: '#e2e8f0', active: '#1e293b' },
        success: { DEFAULT: '#16a34a', light: '#dcfce7', dark: '#15803d' },
        warning: { DEFAULT: '#d97706', light: '#fef3c7' },
        error: { DEFAULT: '#dc2626', light: '#fee2e2' },
        info: { DEFAULT: '#2563eb', light: '#dbeafe' },
        blocked: { DEFAULT: '#ea580c', light: '#fff7ed' },
        surface: '#ffffff',
        background: '#f8fafc',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display': ['1.5rem', { lineHeight: '1.2', fontWeight: '700' }],
        'heading': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'subheading': ['1rem', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'small': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        'tiny': ['0.6875rem', { lineHeight: '1.3', fontWeight: '500' }],
      },
      spacing: {
        'xs': '4px', 'sm': '8px', 'md': '12px',
        'base': '16px', 'lg': '20px', 'xl': '24px',
        '2xl': '32px', '3xl': '48px',
      },
      borderRadius: {
        'card': '12px', 'input': '8px', 'badge': '999px', 'button': '8px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.08)',
        'modal': '0 4px 16px rgba(0,0,0,0.12)',
        'overlay': '0 8px 32px rgba(0,0,0,0.16)',
      },
      minHeight: {
        'tap': '48px',
        'toggle-row': '56px',
        'quick-action': '80px',
      },
    },
  },
}
```

---

*End of Bulwark Design System & Style Guide v1.0*  
*Companion to: BULWARK_UX_CONTEXT.md (23-screen specification)*  
*Next revision: Post-Drew interview — update if field feedback changes any patterns*
