# BULWARK — UX Context Document
> Wireframe Design Brief | Version 1.1
> For use with AI wireframing tools (Open UI or equivalent)
> Prepared by Brandtworks-Enterprises LLC
> v1.1 — Added Part 5 (Screens by User System) and Part 6 (Build Approach). Pointer to canonical `BULWARK_SCREENS_BY_ROLE.md` added.

---

## How to Use This Document

This document defines every screen in the Bulwark application, including all interactive elements, navigation flows, field behaviors, and screen states. It is written to be handed directly to an AI wireframing tool as context.

**Key design constraints to apply globally:**
- Mobile-first. Every screen must be fully functional on a 390px wide phone screen.
- Tablet-optimized. At 768px+, layouts may expand to use additional space but must not require it.
- Desktop-enhanced. At 1280px+, side-by-side layouts and data tables are appropriate.
- No page loads between primary interactions. Navigation between major sections should feel instant.
- Field workers are the primary users for most screens. Assume gloved hands, sunlight, and a phone held in one hand.
- Assume no mouse. All tap targets minimum 48x48px.

---

## Part 1 — Field Type Library

Before defining screens, this section establishes a reusable vocabulary of input field types. Every input field in this application belongs to one of these types. When specific screens reference a field, they will name its type. This allows wireframes to be built with correct interactive behavior before final field labels are decided.

---

### FT-01 — Text: Short Label
**Use for:** Names, titles, identifiers, short descriptive values  
**Appearance:** Single-line text input with label above  
**Behavior:**
- Tapping activates keyboard
- Placeholder text shown when empty (greyed, non-selectable)
- Character limit indicator appears when within 20 chars of limit (if limit applies)
- Clear button (×) appears inside field when content is present
- On mobile: triggers standard keyboard  
**Validation states:**
- Default (unfilled, no interaction)
- Active (currently focused, border highlight)
- Filled (has value, normal display)
- Error (red border + error message below field)
- Disabled (greyed, non-interactive, value visible but locked)
- Read-only (no border, value displays as plain text — used in review/summary views)

---

### FT-02 — Text: Long / Notes
**Use for:** Descriptive notes, observations, free-form comments  
**Appearance:** Multi-line textarea, minimum 3 lines tall, expands as content grows  
**Behavior:**
- Tapping activates keyboard
- Auto-expands vertically as user types — never scrolls internally
- Character count shown in bottom-right corner when field is active
- On mobile: triggers standard keyboard; "Done" button on keyboard collapses it
- Placeholder text shown when empty  
**Validation states:** Same as FT-01

---

### FT-03 — Numerical: Whole Number
**Use for:** Counts, quantities, ages in whole units  
**Appearance:** Single-line input, right-aligned number, label above, optional unit label to the right (e.g. "units", "years")  
**Behavior:**
- Tapping activates numeric keypad (no decimal)
- Increment/decrement buttons (+/−) flank the field for easy adjustment
- Min/max constraints enforced — input above max snaps to max, below min snaps to min
- Zero is a valid value unless field specifies otherwise
- Clear button not shown — use decrement to zero  
**Validation states:** Same as FT-01 plus:
- Out-of-range state (amber border + advisory message, not blocking)

---

### FT-04 — Numerical: Measurement (Decimal)
**Use for:** Dimensions, areas, lengths, volumes  
**Appearance:** Single-line input, right-aligned number, label above, unit selector adjacent (dropdown: ft, in, sq ft, linear ft, etc.)  
**Behavior:**
- Tapping activates decimal numeric keypad
- Unit selector is a compact inline dropdown, defaults to the most common unit for that field context
- Changing unit does NOT auto-convert existing value (this is an input, not a calculator)
- Placeholder shows example format ("e.g. 24.5")
- Up to 2 decimal places accepted  
**Validation states:** Same as FT-03

---

### FT-05 — Numerical: Currency
**Use for:** Costs, prices, totals, labor rates  
**Appearance:** Single-line input, left-aligned currency symbol ($), right-aligned number value, label above  
**Behavior:**
- Tapping activates decimal numeric keypad
- Auto-formats with commas on blur (e.g. 1500 → 1,500.00)
- Negative values not permitted unless field explicitly allows
- Placeholder: "0.00"
- On blur: rounds to 2 decimal places  
**Validation states:** Same as FT-01

---

### FT-06 — Percentage
**Use for:** Margins, rates, markups  
**Appearance:** Single-line input with % symbol appended, label above  
**Behavior:**
- Numeric keypad, 0–100 range enforced
- Up to 1 decimal place accepted
- Slider may optionally accompany the field for coarse adjustment  
**Validation states:** Same as FT-03

---

### FT-07 — Date Picker
**Use for:** Scheduled dates, permit dates, inspection dates, target completion  
**Appearance:** Read-only display field showing formatted date, tap to open picker. Calendar icon to the right.  
**Behavior:**
- Mobile: opens native date picker (OS default)
- Desktop: opens inline calendar popover
- Selected date displayed as: "Mon, Mar 28" (short) or "Monday, March 28, 2026" (long) depending on context
- Clear option available unless field is required
- Minimum/maximum date constraints applied per context (e.g. can't schedule inspection before work order start)  
**States:** Default (no date), Filled (date selected), Disabled, Error

---

### FT-08 — Time Picker
**Use for:** Scheduled times, appointment windows  
**Appearance:** Read-only display field showing formatted time, tap to open picker. Clock icon to the right.  
**Behavior:**
- Mobile: opens native time picker
- Desktop: opens inline time selector (hour/minute/AM-PM)
- 15-minute increment snapping on scroll  
**States:** Default, Filled, Disabled

---

### FT-09 — Single Select (Dropdown)
**Use for:** Choosing one option from a defined list (status, material type, trade, etc.)  
**Appearance:** Styled select with chevron icon, label above, selected value displayed  
**Behavior:**
- Mobile: opens native OS picker sheet or a bottom sheet modal (consistent throughout app)
- Desktop: opens styled dropdown below the field
- Search/filter inside dropdown when list exceeds 6 items
- Placeholder option shown when no selection ("Select a value...")
- Selection closes the picker and shows value in field  
**States:** Default (no selection), Filled, Disabled, Error

---

### FT-10 — Multi-Select
**Use for:** Choosing one or more options (trade types, applicable zones, tags)  
**Appearance:** Tag-style display showing selected items as chips inside the field, chevron icon, label above  
**Behavior:**
- Tapping opens a bottom sheet (mobile) or popover (desktop) with checkboxes for each option
- Selected items appear as removable chips inside the field
- Individual chips can be tapped to remove
- "Select all" option at top when applicable
- Counter badge shows number selected when field is collapsed  
**States:** Default (empty), Partially filled (some selected), Filled, Error

---

### FT-11 — Toggle (Boolean / Pass-Fail)
**Use for:** Yes/no, pass/fail, compliant/non-compliant decisions — primary use in assessment checklist  
**Appearance:** Large pill-shaped toggle. Two states clearly labeled inline (e.g. "Pass / Fail", "Yes / No", "Compliant / Non-Compliant"). Label above.  
**Behavior:**
- Entire toggle is a single tap target — minimum 56px tall, full width of its container
- Active state (current selection) shows filled background color: green for positive/pass, red/amber for negative/fail
- Unselected state is greyed outline
- No default value — both sides appear unselected until user interacts
- A "Not Applicable" third option may be added as a smaller text link below the toggle where relevant  
**States:** Unselected (required but empty), Pass selected, Fail selected, N/A selected, Disabled

---

### FT-12 — Segmented Control
**Use for:** Switching between 2–4 views or filters on a screen (not for data input)  
**Appearance:** Horizontal row of equal-width buttons, selected segment has filled background  
**Behavior:**
- Tap any segment to activate it immediately
- Does not submit — purely a UI filter/view control
- Maximum 4 segments before a dropdown should be used instead  
**States:** Active segment, Inactive segment

---

### FT-13 — Search Field
**Use for:** Filtering lists, finding records  
**Appearance:** Full-width input with magnifying glass icon on the left, clear (×) button on the right when content present  
**Behavior:**
- Results filter in real time as user types (debounced 300ms)
- Empty state shown when search returns no results (not an error)
- On mobile: keyboard appears, "Search" action button on keyboard
- Clearing field restores full unfiltered list  
**States:** Default, Active (typing), Results shown, No results

---

### FT-14 — Photo / File Capture
**Use for:** Before/after photos, permit documents, attachment uploads  
**Appearance:** Dashed-border rectangle with camera icon and "Add Photo" label. After capture: thumbnail grid.  
**Behavior:**
- Tapping on mobile opens action sheet: "Take Photo" / "Choose from Library"
- Tapping on desktop opens file picker
- Multiple files supported; each shows as thumbnail with remove (×) button
- Upload progress shown per file (progress bar on thumbnail)
- Tap thumbnail to preview full size
- Maximum file size enforced with friendly error if exceeded  
**States:** Empty, Uploading, Filled (thumbnails shown), Error (upload failed)

---

### FT-15 — Signature Capture
**Use for:** GC sign-off on compliance documents  
**Appearance:** Large bordered area with "Sign here" prompt, clear button below  
**Behavior:**
- Finger/stylus draw on mobile; mouse draw on desktop
- "Clear" button resets the canvas
- Signature is captured as image on submit
- Read-only preview mode shows captured signature as image (non-editable)  
**States:** Empty, Signed, Read-only preview

---

### FT-16 — Status Badge (Display Only)
**Use for:** Showing record status in lists and detail headers — not an input  
**Appearance:** Small pill/chip with colored background and status label text  
**Color mapping (consistent across entire app):**
- Lead / Draft → Grey
- Contacted / Pending → Blue
- In Progress / Active → Amber
- Quoted / Scheduled → Purple
- Accepted / Compliant → Green
- Declined / Non-Compliant / Overdue → Red
- Complete / Paid → Dark Green
- Blocked → Orange  
**Behavior:** Display only. Tapping a badge in a list navigates to the record detail.

---

### FT-17 — Inline Action Menu (⋮ Menu)
**Use for:** Per-row actions in lists and tables  
**Appearance:** Three-dot vertical ellipsis icon at end of each row  
**Behavior:**
- Tapping opens a bottom sheet (mobile) or small popover (desktop) listing available actions for that row
- Actions are text items with optional leading icon
- Destructive actions (Delete, Cancel) appear at bottom, colored red
- Tapping an action triggers it and closes the menu
- Tapping outside the menu closes it  
**Common actions by context:**
- Property: Edit, View Assessment, Create Quote, Archive
- Quote: Edit, Mark Accepted, Mark Declined, Download PDF
- Work Order: Edit, Update Progress, Mark Complete
- Invoice: Edit, Mark Paid, Send to Client

---

### FT-18 — Confirmation Modal
**Use for:** Destructive or irreversible actions (delete, cancel, submit final)  
**Appearance:** Centered overlay modal (mobile: bottom sheet). Title, description sentence, two buttons.  
**Behavior:**
- Title states what will happen ("Cancel this work order?")
- Description gives brief consequence ("This cannot be undone. Assigned subcontractors will be notified.")
- Primary button: destructive action, red ("Yes, Cancel Work Order")
- Secondary button: dismiss, grey outline ("Go Back")
- Tapping outside modal = Go Back  
**Always used for:** Deleting any record, cancelling a work order, voiding a quote, submitting a compliance document (final)

---

### FT-19 — Toast / Notification
**Use for:** Confirming successful actions or showing non-blocking errors  
**Appearance:** Pill-shaped floating bar at top of screen (mobile) or bottom-right (desktop). Icon + short message. Auto-dismisses.  
**Behavior:**
- Success: green, checkmark icon, dismisses after 3 seconds
- Error: red, warning icon, stays until dismissed by tap
- Info: blue, info icon, dismisses after 4 seconds
- Warning: amber, warning icon, stays until dismissed  
**Examples:** "Quote saved", "Assessment submitted", "PDF generated — tap to download", "Connection lost — working offline"

---

### FT-20 — Empty State
**Use for:** Lists and views with no records yet  
**Appearance:** Centered illustration (simple icon, not photograph), headline, sub-text, optional primary action button  
**Behavior:**
- Always provides a path forward ("Add your first property" button)
- Filtered empty state (search returned nothing) shows different message from truly empty state
- Never shows a blank white screen with no explanation  
**Examples:**
- No properties: "No properties yet. Add your first one to get started." + "Add Property" button
- Search no results: "No properties match '[search term]'. Try a different search."

---

## Part 2 — Global Navigation & Shell

### Mobile Navigation Shell
**Pattern:** Bottom tab bar (fixed, always visible)  
**Tabs (5 maximum):**
1. Home (field dashboard) — house icon
2. Properties — building icon
3. Jobs (work orders) — clipboard icon
4. Quotes — document-dollar icon
5. Menu (overflow: Subs, Invoices, Compliance, Settings) — grid or hamburger icon

**Top bar:** App name "Bulwark" left-aligned. Context-sensitive action button right-aligned (e.g. "+ Add" on list screens, "Edit" on detail screens, "Generate PDF" on compliance screens). Back chevron replaces app name on detail screens.

**Behavior:**
- Active tab has filled icon + colored label
- Badge counter on Jobs tab when jobs have status updates
- Menu tab opens a full-screen slide-up drawer listing overflow sections
- Bottom tab bar stays fixed — content scrolls behind it

---

### Desktop Navigation Shell
**Pattern:** Fixed left sidebar (collapsible to icon-only mode)  
**Sidebar sections:**
- Dashboard
- Properties (with sub-items: All Properties, Pipeline View)
- Work Orders
- Quotes
- Compliance Docs
- Invoices
- Subcontractors
- Settings

**Top bar:** Breadcrumb navigation center. User avatar + name top-right with dropdown (Profile, Sign Out).

---

## Part 3 — Screen Specifications

---

### SCREEN 01 — Login
**Route:** `/login`  
**Primary device:** Both  
**Purpose:** Authenticate the user. Two admin users at MVP.

**Layout:**
- Centered card on white or light background
- Bulwark logo / wordmark at top of card
- Tagline below logo: "Wildfire Retrofit Operations"

**Fields:**
- Email address — FT-01 (Short Label, keyboard type: email)
- Password — FT-01 variant (masked, show/hide toggle inside field)

**Actions:**
- Primary button: "Sign In" — full width, submits form
- "Forgot password?" — small text link below Sign In button (Phase 2 — shown greyed/disabled at MVP with tooltip "Contact your administrator")

**States:**
- Default (empty form)
- Loading (Sign In button shows spinner, fields disabled)
- Error (FT-19 toast: "Invalid email or password" — do not specify which field failed, security best practice)
- Success (redirect to dashboard)

**Interactions:**
- Enter key on password field submits form
- Email field auto-focuses on page load

---

### SCREEN 02 — Field Dashboard
**Route:** `/` (for field role) or `/field`  
**Primary device:** Phone / Tablet  
**Purpose:** Give the GC partner an at-a-glance view of today's work and quick access to the most common actions.

**Layout (mobile, stacked vertically):**

**Section A — Greeting + Date**
- "Good morning, [First Name]" — large text
- Today's date below — smaller, greyed

**Section B — Today's Jobs**
- Horizontal scroll card row (snap scrolling)
- Each card: Property address (bold), Job status badge (FT-16), scheduled time if set, assigned trade summary ("Roofing + Siding")
- Tapping a card navigates to SCREEN 13 (Work Order Detail)
- If no jobs today: FT-20 empty state card inline ("No jobs scheduled today")

**Section C — Quick Actions**
- 2×2 grid of large tap buttons (minimum 80px tall each):
  1. "New Property" → navigates to SCREEN 06
  2. "New Assessment" → navigates to property selector then SCREEN 08
  3. "Update Job" → navigates to SCREEN 14
  4. "Generate Doc" → navigates to SCREEN 17

**Section D — Pipeline Snapshot**
- Compact horizontal status strip: counts for each pipeline stage
- Format: "3 Quoted · 2 In Progress · 1 Inspection Ready"
- Tapping the strip navigates to SCREEN 04 (Property Pipeline)

**Section E — Recent Activity**
- Last 5 actions taken in the system (any user)
- Each item: icon, description, time ago ("Assessment submitted for 1847 Rimrock Rd — 2h ago")

**Actions (top bar):**
- Right: notification bell icon (Phase 2 — show but disabled at MVP)

---

### SCREEN 03 — Admin Dashboard
**Route:** `/admin` or `/dashboard`  
**Primary device:** Desktop  
**Purpose:** Give the admin (Matthew) full business visibility — pipeline health, financials, and operational status.

**Layout (desktop, grid):**

**Row 1 — KPI Cards (4 across)**
- Total Active Jobs (count, link to work orders filtered: active)
- Quotes Pending Acceptance (count + total value, link to quotes filtered: sent)
- Revenue This Month (currency, FT-05 display)
- Overdue Invoices (count, red if >0, link to invoices filtered: overdue)

**Row 2 — Pipeline Kanban Preview**
- Condensed horizontal kanban showing count per stage
- "View Full Pipeline" button → SCREEN 04

**Row 3 — Split: Recent Jobs (left) + Outstanding Quotes (right)**
- Recent Jobs: list of 5 most recently updated work orders. Columns: address, status badge, GC assignee, last updated.
- Outstanding Quotes: list of 5 sent quotes not yet accepted. Columns: address, quote total, sent date, days waiting.

**Row 4 — Revenue Chart**
- Simple bar chart: last 6 months revenue (jobs invoiced + paid)
- Toggle: Monthly / Weekly (FT-12 segmented control)

**Actions:**
- Each KPI card is tappable and links to the relevant filtered list
- "+" button top-right opens quick-add menu: New Property, New Quote, New Work Order

---

### SCREEN 04 — Property Pipeline
**Route:** `/properties`  
**Primary device:** Both (different layouts)  
**Purpose:** Visual overview of all properties by their stage in the workflow.

**Mobile Layout:**
- FT-12 segmented control at top: "Pipeline" | "List"
- Pipeline view: vertical stacked sections, one per stage. Each stage has a count badge and collapses/expands. Properties show as compact cards within each stage.
- List view: scrollable list of all properties. Each row: address, status badge, owner name, last updated.
- FT-13 search field at top, filters in real-time across both views
- FT-12 secondary filter row below search: filter by stage (pills, multi-select)

**Desktop Layout:**
- Full horizontal Kanban board
- Columns: Lead | Contacted | Assessment Scheduled | Assessed | Quoted | Accepted | In Progress | Inspection Ready | Complete
- Each column scrolls independently vertically
- Property cards show: address, owner name, status badge, last activity date
- Drag-and-drop to move cards between columns (triggers confirmation if moving backwards in pipeline)
- FT-13 search + filter bar above the board

**Property Card (both layouts):**
- Address line 1 (bold)
- Owner name
- Status badge (FT-16)
- Last updated timestamp
- Quick action: FT-17 inline action menu (⋮)

**Actions:**
- Floating action button (FAB) bottom-right: "+ Add Property" → SCREEN 06
- Tapping a card navigates to SCREEN 05 (Property Detail)
- FT-17 menu per card: Edit, View Assessment, Create Quote, Archive

**Empty states:**
- No properties: FT-20 ("No properties yet. Add your first one.")
- No results for search: FT-20 ("No properties match your search.")

---

### SCREEN 05 — Property Detail (Hub)
**Route:** `/properties/[id]`  
**Primary device:** Both  
**Purpose:** Central hub for a single property. All related records (assessment, quotes, work orders, compliance docs) are accessible from here.

**Layout:**

**Header Section:**
- Property address (large, bold)
- Owner name + phone (tappable — dials on mobile)
- Status badge (FT-16) — tapping opens FT-09 status change dropdown (admin only)
- Hazard zone indicator (e.g. "High Wildfire Zone — Harney County")
- Parcel ID (small, greyed)

**Tab Bar (FT-12, horizontal scroll on mobile):**
1. Overview
2. Assessment
3. Quote
4. Work Order
5. Compliance
6. Notes

**Tab: Overview**
- Two-column summary (mobile: stacked): key property details on left, timeline/activity log on right
- Timeline: chronological list of all actions taken on this property with timestamps and actor name
- "Edit Property Info" button — opens slide-over panel with editable fields

**Tab: Assessment**
- If no assessment: FT-20 state + "Start Assessment" button → SCREEN 08
- If assessment exists: summary of results, compliance flags highlighted, "View Full Assessment" button → SCREEN 09, "Edit" button
- Assessment date and assessor name shown

**Tab: Quote**
- If no quote: FT-20 + "Create Quote" button → SCREEN 10 (pre-populated from assessment)
- If quote(s) exist: list of quotes with status badges. Most recent at top. Tapping → SCREEN 11
- "New Quote" button (creates additional quote revision)

**Tab: Work Order**
- If no work order: FT-20 + "Create Work Order" button (only enabled if accepted quote exists)
- If work order exists: summary card showing status, assigned trades, scheduled dates. "View Full Work Order" → SCREEN 13

**Tab: Compliance**
- If work order not complete: greyed state with message "Available after work order is marked complete"
- If work order complete, no doc generated: "Generate Compliance Document" button → SCREEN 17
- If doc generated: preview thumbnail, issue date, "Download PDF" button, "Regenerate" option

**Tab: Notes**
- FT-02 (Long Text) — shared notes field, auto-saves on blur
- Below: activity comments log — timestamped entries from any user
- "Add Comment" button appends a new timestamped comment

**Actions (top bar):**
- Edit icon → edit mode for property header fields
- FT-17 menu (⋮): Archive Property, Delete (FT-18 confirmation)

---

### SCREEN 06 — New Property Intake
**Route:** `/properties/new`  
**Primary device:** Phone / Tablet  
**Purpose:** Quickly capture a new property record in the field. Designed to be completable in under 2 minutes.

**Layout:** Single scrolling form, grouped sections

**Section: Property Address**
- Street address — FT-01 (keyboard type: address, autocomplete enabled where possible)
- City — FT-01
- County — FT-09 (Single Select, Eastern Oregon counties list)
- ZIP code — FT-01 (keyboard type: numeric)
- Parcel ID — FT-01 (optional at intake, labelled "Optional — can add later")

**Section: Property Owner**
- Owner / Contact name — FT-01
- Phone number — FT-01 (keyboard type: phone)
- Email address — FT-01 (keyboard type: email, optional)

**Section: Initial Status**
- Pipeline stage — FT-09 (default: "Lead")
- Wildfire hazard zone — FT-09 (High / Extreme / Moderate — select from known zone classifications)
- Insurance status — FT-09 (Uninsured / At Risk / Currently Insured / Unknown)

**Section: Notes**
- Initial notes — FT-02 (placeholder: "First impression, how contact was made, urgency notes...")

**Actions:**
- Sticky footer bar (always visible above keyboard):
  - "Save & Add Assessment" — primary button (saves property then navigates to SCREEN 08)
  - "Save Property" — secondary button (saves and returns to SCREEN 04)
- "Cancel" — top-left, navigates back without saving. FT-18 confirmation if form has content.

**Validation:**
- Street address and owner name are required
- All other fields optional at intake
- Inline error messages below failed fields on submit attempt

---

### SCREEN 07 — Client / Owner Contact Detail
**Route:** `/properties/[id]/contact`  
**Primary device:** Both  
**Purpose:** View and edit owner contact information and communication notes.

**Layout:**

**Header:**
- Owner full name (large)
- Status badges: Insurance status, Pipeline stage

**Contact Info Section:**
- Phone number — display with tap-to-call icon (mobile)
- Email address — display with tap-to-email icon
- Preferred contact method — FT-09 (Phone / Email / Text)
- Best time to contact — FT-01

**Communication Log:**
- Reverse-chronological list of logged interactions
- Each entry: date, type (Call / Text / Email / In Person), brief note, logged by
- "+ Log Contact" button → opens bottom sheet with:
  - Contact type — FT-09
  - Date — FT-07
  - Notes — FT-02
  - "Save" button

**Actions:**
- "Edit Contact Info" button — toggles fields to editable mode inline
- "Save Changes" and "Cancel" appear in footer when in edit mode

---

### SCREEN 08 — Assessment Form
**Route:** `/properties/[id]/assessment/new` or `/properties/[id]/assessment/[id]/edit`  
**Primary device:** Phone / Tablet  
**Purpose:** The primary field data entry screen. GC completes this on site. Must support partial saves and resume.

**Critical design requirements for this screen:**
- Progress indicator at top showing sections completed (e.g. "3 of 6 sections complete")
- Each section is independently collapsible — completed sections collapse to a green summary bar
- Auto-save on every field blur — no data lost if app is closed
- "Save & Exit" always visible — never trap the user
- Large, high-contrast field labels for outdoor readability
- Toggle buttons (FT-11) must be at least 56px tall — primary input mechanism on this screen

**Layout: Sectioned scrolling form**

**Top Bar:**
- Property address (bold, truncated if needed)
- Progress indicator: "Section 3 of 6"
- "Save & Exit" button top-right

**Progress Bar:**
- Visual horizontal progress bar below top bar, fills as sections complete

---

**Section Header Pattern (each section follows this):**
- Section title (large, bold)
- Section status icon: empty circle (not started), partial circle (in progress), filled green circle (complete)
- Collapse/expand chevron
- When collapsed: shows one-line summary of key values entered

---

**[SECTION A — Roof]**
*Fields use generic types — labels will be specified by partner input:*
- Roof material type — FT-09 (Single Select — list populated from compliance standards config)
- Roof age — FT-03 (Whole Number, unit: years)
- Roof condition — FT-09 (Single Select: Good / Fair / Poor / Unknown)
- Compliant status — FT-11 (Pass / Fail toggle — auto-suggested based on material selection, overrideable)
- Notes — FT-02

**[SECTION B — Siding]**
- Siding material type — FT-09
- Condition — FT-09 (Good / Fair / Poor / Unknown)
- Measurement per building face (repeat group, up to 4 faces):
  - Face label — FT-09 (North / South / East / West)
  - Area measurement — FT-04 (Measurement/Decimal, unit: sq ft)
- Total area auto-calculated and displayed (read-only sum)
- Compliant status — FT-11
- Notes — FT-02

**[SECTION C — Eaves]**
- Eave type — FT-09 (Single Select — options from compliance config)
- Condition — FT-09
- Compliant status — FT-11
- Notes — FT-02

**[SECTION D — Vents]**
- Vent type — FT-09 (Single Select — options from compliance config)
- Approximate vent count — FT-03
- Compliant status — FT-11
- Notes — FT-02

**[SECTION E — Deck / Attached Structures]**
- Has attached deck or structure? — FT-11 (Yes / No — if No, rest of section hides)
- Deck material — FT-09 (shown only if Yes)
- Deck area — FT-04 (shown only if Yes)
- Compliant status — FT-11 (shown only if Yes)
- Notes — FT-02

**[SECTION F — Zone 1 Clearance (0–5ft around foundation)]**
- Clearance present? — FT-11 (Pass / Fail)
- Ground cover type — FT-09 (Gravel / Concrete / Pavers / Vegetation / Mixed)
- Notes — FT-02

**[SECTION G — General Site Notes]**
- Access notes — FT-02 (parking, gate codes, dogs, hazards)
- Additional observations — FT-02
- Phase 3+: Audio note capture button (hold to record — shown as disabled at MVP with "Coming Soon" label)

---

**Bottom of form — Compliance Summary (auto-generated, read-only):**
- List of all sections marked Fail
- Color-coded: green = all pass, amber = some fail, red = multiple critical fails
- "Submit Assessment" primary button (only enabled when all sections have a status value)
- "Save Draft" secondary button

**Submit behavior:**
- FT-18 confirmation: "Submit this assessment? You can still edit it after submitting."
- On confirm: saves, navigates to SCREEN 09 (Assessment Summary)

---

### SCREEN 09 — Assessment Summary
**Route:** `/properties/[id]/assessment/[id]`  
**Primary device:** Both  
**Purpose:** Read-only review of a completed assessment. Shows compliance status clearly. Gateway to quote creation.

**Layout:**

**Header:**
- Property address
- Assessment date + assessor name
- Overall compliance status — large badge: "4 of 6 Sections Non-Compliant" in red/amber/green

**Compliance Summary Section:**
- Card per section (Roof, Siding, Eaves, Vents, Deck, Clearance)
- Each card: section name, pass/fail badge, one-line summary of key values
- Non-compliant cards highlighted with amber/red left border
- Expand chevron on each card to see full section detail

**Required Upgrades List:**
- Auto-generated from non-compliant sections
- Each item: what needs to change, which standard it references
- This list becomes the basis for the quote line items

**Actions:**
- "Create Quote from Assessment" — primary button → SCREEN 10 (pre-populates line items from required upgrades list)
- "Edit Assessment" — secondary → SCREEN 08 in edit mode
- "Print / Export" — generates summary PDF (not the compliance certificate — just internal summary)

---

### SCREEN 10 — Quote Builder
**Route:** `/properties/[id]/quotes/new` or `/properties/[id]/quotes/[id]/edit`  
**Primary device:** Desktop (complex data entry — mobile view is read-only with "Edit on desktop" advisory)  
**Purpose:** Build a line-item quote from assessment findings. Calculate total with margin.

**Layout:**

**Header:**
- Property address
- Quote status badge (FT-16)
- Quote number (auto-generated, display only)

**Line Items Table:**
- Column headers: Category | Description | Labor ($) | Materials ($) | Qty | Unit | Line Total
- Each row: editable inline. Clicking a cell activates it.
- Category — FT-09 per row (Roofing / Siding / Eaves / Vents / Deck / Other)
- Description — FT-01 per row
- Labor cost — FT-05 per row
- Materials cost — FT-05 per row
- Quantity — FT-03 per row
- Unit — FT-09 per row (sq ft / linear ft / unit / each / lot)
- Line total: auto-calculated (read-only)
- FT-17 action menu per row: Duplicate Row, Delete Row

**Row Controls:**
- "+ Add Line Item" button below table adds a new blank row
- "Add from Assessment" button pre-populates rows from required upgrades list (if assessment exists)
- Rows can be reordered by drag handle

**Totals Section (sticky right panel on desktop, bottom section on mobile):**
- Subtotal — FT-05 display (auto-calculated)
- Margin % — FT-06 (editable — adjusts total)
- Margin $ amount — FT-05 display (auto-calculated)
- **Total — FT-05 display (large, bold)**

**Notes Section:**
- Internal notes — FT-02 (not shown on client-facing PDF)
- Client-facing notes — FT-02 (included in quote PDF — terms, exclusions, validity period)

**Actions:**
- "Save Draft" — secondary button
- "Preview Quote" — opens SCREEN 11 in preview mode
- "Generate & Send Quote PDF" — primary button. FT-18 confirmation. Generates PDF, marks status "Sent".
- "Mark Accepted" — shown when status is "Sent". FT-18 confirmation.
- "Mark Declined" — shown when status is "Sent". Opens brief reason dropdown.

---

### SCREEN 11 — Quote Review / Preview
**Route:** `/properties/[id]/quotes/[id]`  
**Primary device:** Both  
**Purpose:** Client-facing view of quote before/after PDF generation. Also used internally for review.

**Layout:**

**Header:**
- Bulwark company info (name, GC license, contact)
- "QUOTE" title, quote number, date issued
- Validity period ("Valid for 30 days")

**Client / Property Section:**
- Owner name and address
- Property address

**Line Items (read-only table):**
- Category, Description, Quantity, Unit, Line Total (labor + materials combined — client does not see breakdown)

**Totals:**
- Subtotal, margin displayed as "Overhead & Administration" (or configurable label)
- Total — large, bold

**Client Notes:**
- Displayed below totals

**Actions:**
- "Edit Quote" → SCREEN 10
- "Download PDF" — generates and downloads PDF
- "Mark Accepted" — FT-18 confirmation → advances property pipeline to "Accepted"
- "Mark Declined" — FT-18 confirmation with optional reason note

---

### SCREEN 12 — Quote List
**Route:** `/quotes`  
**Primary device:** Desktop  
**Purpose:** All quotes across all properties, filterable by status.

**Layout:**
- FT-13 search (searches by address, owner name, quote number)
- FT-12 filter tabs: All | Draft | Sent | Accepted | Declined
- Data table: Quote # | Property Address | Owner | Total | Status | Date Sent | Days Open
- FT-17 per row: View, Edit, Download PDF, Mark Accepted, Mark Declined
- Sorting: click column headers

**Empty states:** Per filter tab — "No [status] quotes"

---

### SCREEN 13 — Work Order Detail
**Route:** `/workorders/[id]`  
**Primary device:** Both  
**Purpose:** Full details of a work order including assigned trades, schedule, and progress.

**Layout:**

**Header:**
- Property address (bold)
- Work order status badge (FT-16)
- Scheduled start → end dates
- Permit number — FT-01 (editable inline)

**Trades Section:**
- One card per trade (Roofing / Siding / Carpentry / General)
- Each trade card:
  - Trade label
  - Assigned subcontractor name (FT-09 selector to change) + phone (tap to call on mobile)
  - Scheduled date for this trade — FT-07
  - Status — FT-09 (Assigned / Confirmed / In Progress / Complete)
  - Notes — FT-02
- "+ Add Trade" button adds another trade card

**Scope Summary:**
- Read-only list of work scope pulled from accepted quote line items

**Progress Notes:**
- Reverse-chronological list of field updates (from SCREEN 14)
- Each entry: date, user, status at time of entry, note text

**Inspection Section:**
- Inspection date — FT-07
- Inspection passed — FT-11 (Pass / Fail)
- Inspector name — FT-01
- Permit sign-off date — FT-07

**Actions:**
- "Update Progress" → SCREEN 14
- "Mark Work Order Complete" — primary button, only active when all trades are "Complete" and inspection passed. FT-18 confirmation.
- "Generate Compliance Document" — appears after work order is marked complete → SCREEN 17
- FT-17 top-right: Edit Work Order, Cancel Work Order (FT-18 confirmation)

---

### SCREEN 14 — Job Progress Update
**Route:** `/workorders/[id]/update`  
**Primary device:** Phone / Tablet  
**Purpose:** Fast field update screen. Designed to be completed in under 60 seconds.

**Layout — stripped down, action-focused:**

**Header:**
- Property address (abbreviated)
- Current overall status badge

**Today's Update Section:**
- For each assigned trade (only show trades assigned to today or in-progress):
  - Trade name (bold)
  - Status update — FT-09 (Not Started / In Progress / Complete)
- Overall job note — FT-02 (placeholder: "What happened today?")
- Phase 2: Photo capture — FT-14

**Quick Status Section:**
- Is the job on schedule? — FT-11 (Yes / No)
- If No: reason — FT-09 (Weather / Materials Delayed / Sub No Show / Scope Change / Other)

**Actions:**
- Sticky footer: "Submit Update" — full-width primary button
- "Cancel" — text link, returns without saving

**Confirmation:** FT-19 success toast: "Update saved"

---

### SCREEN 15 — Subcontractor List
**Route:** `/subcontractors`  
**Primary device:** Desktop  
**Purpose:** Manage subcontractor contacts and trade assignments.

**Layout:**
- FT-13 search
- Filter by trade — FT-10 (Multi-Select chips)
- Data table: Name | Trade(s) | Phone | License # | Active Jobs | Rating (future)
- FT-17 per row: View Detail, Edit, Deactivate
- "+ Add Subcontractor" button top-right

**Empty state:** "No subcontractors added yet. Add your first sub to start assigning work."

---

### SCREEN 16 — Subcontractor Detail
**Route:** `/subcontractors/[id]`  
**Primary device:** Desktop  
**Purpose:** Full profile for a single subcontractor.

**Layout:**

**Header:**
- Sub name (large)
- Trade tags (chips from FT-10)
- Active / Inactive status toggle (admin only)

**Contact Section:**
- Phone — FT-01 (editable)
- Email — FT-01 (editable)
- Business name — FT-01 (optional)
- License number — FT-01
- Insurance expiration — FT-07 (shows warning badge if within 60 days)

**Job History:**
- Table of past and active work orders this sub has been assigned to
- Columns: Property, Trade, Date, Status

**Notes:**
- FT-02 — internal notes about this sub (reliability, specialties, notes)

**Actions:**
- "Edit" button → inline field editing
- "Save" / "Cancel" in footer when editing

---

### SCREEN 17 — Compliance Document Generator
**Route:** `/properties/[id]/compliance/new`  
**Primary device:** Desktop  
**Purpose:** Assemble and generate the official compliance document for insurer submission.

**Layout:**

**Header:**
- Property address
- "Compliance Document Generator"
- Status: "Work Order Complete — Ready to Generate"

**Review Checklist (pre-populated, editable):**

Section A — Scope of Work:
- Auto-populated from work order line items
- Each item: description, editable — FT-01 (admin can adjust wording)
- "+ Add Item" for any additional scope not in work order

Section B — Materials Used:
- One row per material category:
  - Category — FT-09 (Roofing / Siding / Eaves / Vents / Deck)
  - Product/material name — FT-01
  - Manufacturer — FT-01
  - Fire rating / spec — FT-01
  - Quantity installed — FT-04 + unit FT-09
- "+ Add Material" button

Section C — Permit & Inspection:
- Permit number — FT-01
- Permit issue date — FT-07
- Inspection date — FT-07
- Inspection result — FT-09 (Passed / Passed with Conditions)
- Inspector name — FT-01 (optional)

Section D — GC Certification:
- GC name — FT-01 (pre-populated from settings, editable)
- GC license number — FT-01 (pre-populated from settings)
- Statement of certification — read-only display text (legal language, pre-set in settings)
- Signature — FT-15 (captured here)
- Date — FT-07 (defaults to today)

**Actions:**
- "Preview Document" → SCREEN 18
- "Generate & Finalize" — primary button. FT-18 confirmation: "Once finalized, this document is locked. Continue?" Generates PDF, locks all fields.
- "Save Draft" — secondary button

**States:**
- Draft (all fields editable)
- Finalized (all fields locked, download button shown, regenerate option for admin)

---

### SCREEN 18 — Compliance Document Preview
**Route:** `/properties/[id]/compliance/[id]`  
**Primary device:** Both  
**Purpose:** Final preview of the compliance PDF before download. Homeowner-ready formatting.

**Layout:**
- Renders a styled, print-faithful preview of the document
- Bulwark letterhead at top
- Property details
- Scope of work section
- Materials table
- Permit and inspection details
- GC certification block with captured signature
- Issue date

**Actions:**
- "Download PDF" — primary button. Downloads file named: `[AddressAbbrev]-ComplianceDoc-[Date].pdf`
- "Edit Document" → SCREEN 17 (only if status is Draft)
- "Share" (mobile) — opens OS share sheet with PDF attached
- "Back to Property" — returns to SCREEN 05

**Mobile view:**
- Renders as a scrollable document preview
- Download and Share buttons fixed in footer

---

### SCREEN 19 — Invoice List
**Route:** `/invoices`  
**Primary device:** Desktop  
**Purpose:** All invoices across all properties.

**Layout:**
- FT-13 search
- FT-12 filter tabs: All | Draft | Sent | Paid | Overdue
- Data table: Invoice # | Property | Owner | Total | Status | Due Date | Days Overdue (shown only in Overdue tab)
- FT-17 per row: View, Edit, Mark Paid, Send to Client (Phase 2)
- Summary strip above table: Total Outstanding (currency), Total Overdue (red if >0), Total Paid This Month

---

### SCREEN 20 — Invoice Detail
**Route:** `/invoices/[id]`  
**Primary device:** Both  
**Purpose:** View, edit, and track payment for a single invoice.

**Layout:**

**Header:**
- Invoice number
- Status badge (FT-16)
- Property address + owner name

**Line Items (read-only, pulled from work order/quote):**
- Description, quantity, unit, line total
- Subtotal, total

**Payment Section:**
- Invoice date — FT-07
- Due date — FT-07
- Payment received — FT-11 (Yes / No)
- If Yes: Payment date — FT-07, Payment method — FT-09 (Check / Cash / Transfer / Card)
- Amount received — FT-05 (allows partial payment recording)

**Notes:**
- FT-02 — internal payment notes

**Actions:**
- "Mark as Paid" — primary button (FT-18 confirmation)
- "Edit Invoice" — secondary
- "Download PDF" — invoice formatted for client
- Phase 2: "Send to Client" — emails PDF to owner on file

---

### SCREEN 21 — Company & GC Info (Settings)
**Route:** `/settings/company`  
**Primary device:** Desktop  
**Purpose:** Business configuration used across all generated documents.

**Fields:**
- Business name — FT-01
- GC license number — FT-01
- GC full name (for documents) — FT-01
- Business phone — FT-01
- Business email — FT-01
- Business address — FT-01 (multi-line)
- Default invoice payment terms — FT-01 (e.g. "Net 30")
- Compliance document certification statement — FT-02 (legal boilerplate, editable by admin)
- Logo upload — FT-14 (single image, shown on PDFs)

**Actions:**
- "Save Settings" — primary button
- "Cancel" — secondary

---

### SCREEN 22 — User Management (Settings)
**Route:** `/settings/users`  
**Primary device:** Desktop  
**Purpose:** Manage the 2–4 system users.

**Layout:**
- Simple list of users: Name | Email | Role | Last Login | Actions
- FT-17 per row: Edit Role, Reset Password, Deactivate
- "+ Invite User" button → slide-over panel:
  - Name — FT-01
  - Email — FT-01
  - Role — FT-09 (Admin / Field)
  - "Send Invite" button (Phase 2 — at MVP: creates account with temp password shown on screen)

**Role definitions shown as info text:**
- Admin: Full access including settings, financials, and document generation
- Field: Access to properties, assessments, and job updates. No financial data.

---

### SCREEN 23 — Compliance Standards Config (Settings)
**Route:** `/settings/standards`  
**Primary device:** Desktop  
**Purpose:** Maintain the list of material options and compliance pass/fail logic used in the assessment form. Allows standards to be updated without a code change.

**Layout:**

**Section per assessment category (Roof, Siding, Eaves, Vents, Deck, Clearance):**
- List of material/type options for that category
- Each option: Label — FT-01, Compliant? — FT-11 (Pass / Fail)
- Reorder by drag handle
- "+ Add Option" button per section
- FT-17 per option: Edit, Delete (FT-18 confirmation if option is in use)

**Standard reference notes:**
- FT-02 per section (e.g. "Per OAR 629-044-1030 — updated March 2026")

**Actions:**
- "Save All Changes" — sticky footer primary button
- "Discard Changes" — secondary

---

## Part 4 — Cross-Cutting Interaction Patterns

### Navigation Flow Map

```
Login (01)
  ↓
Field Dashboard (02) [Field role]
Admin Dashboard (03) [Admin role]
  ↓
Property Pipeline (04)
  → Property Detail Hub (05)
      → New Property Intake (06) [create]
      → Client Contact (07)
      → Assessment Form (08) [create/edit]
      → Assessment Summary (09) [view]
          → Quote Builder (10) [create from assessment]
      → Quote Builder (10) [create/edit]
          → Quote Preview (11) [review]
      → Work Order Detail (13) [create/view]
          → Job Progress Update (14) [field update]
          → Compliance Generator (17) [after complete]
              → Compliance Preview (18) [final doc]
  → Quote List (12) [cross-property]
  → Invoice List (19)
      → Invoice Detail (20)
  → Subcontractor List (15)
      → Subcontractor Detail (16)
  → Settings
      → Company Info (21)
      → User Management (22)
      → Standards Config (23)
```

---

### Offline / Connectivity Handling

The assessment form (SCREEN 08) and job progress update (SCREEN 14) must function if connectivity is lost in the field.

- FT-19 warning toast when connectivity is lost: "Working offline — changes will sync when reconnected"
- All field inputs continue to work
- Data is cached locally
- On reconnect: FT-19 success toast: "All changes synced"
- Sync conflict (same record edited by two users): most recent write wins, other user gets FT-19 warning

---

### Unsaved Changes Guard

Any screen with editable fields must:
- Detect when the user navigates away with unsaved changes
- Show FT-18 confirmation: "You have unsaved changes. Leave without saving?" with "Stay" and "Leave" options
- Exception: auto-save screens (assessment form) do not need this guard

---

### PDF Generation Flow (Async)

Triggered from: Quote Builder (10), Compliance Generator (17), Invoice (20)

1. User taps "Generate PDF"
2. Button immediately shows spinner and becomes disabled
3. FT-19 info toast: "Generating PDF..."
4. On completion: FT-19 success toast: "PDF ready — tap to download"
5. Download begins on tap
6. If generation fails: FT-19 error toast: "PDF generation failed. Try again."

PDF generation never blocks navigation — user can move to another screen while it generates.

---

---

## Part 5 — Screens by User System

The original Parts 1–4 above describe 23 screens as a flat list. The full Bulwark application is organized into five user systems with a build priority. The canonical inventory lives in **`BULWARK_SCREENS_BY_ROLE.md`**. This section is a summary pointer.

### System Summary

| System | Role(s) | Build Priority | Screens (MVP / Total) |
|---|---|---|---|
| Shared / Foundation | All | P0 | 8 / 8 |
| Admin | `super_admin`, `org_admin` | P1 | 23 / 31 |
| Contractor | `org_manager`, `field` | P2 | 5 / 5 (mostly mobile variants of Admin) |
| Subcontractor | `sub_contractor` | P2 (Phase 2) | 0 / 5 |
| Homeowner | `homeowner` | P3 (Phase 2) | 0 / 8 |

### What Changed From the 23-Screen List

The 23 screens specified above (01–23) are all in the **Admin** system except for **02 Field Dashboard**, which is the **Contractor** entry point. None of the 23 belong to the Subcontractor or Homeowner systems — those portals are not yet specified.

The following MVP screens are **needed but not yet specified** and require their own spec sections in a future revision of this document (or a supplement):

**Shared / Foundation (8 screens):**
- AUTH-02 Forgot Password
- AUTH-03 Password Reset
- AUTH-04 Accept Invite / Set Password (multi-tenant invite flow)
- AUTH-05 Org Switcher (for super_admin and multi-org users)
- ERR-01 404 Not Found
- ERR-02 403 Forbidden (tenant firewall denial)
- ERR-03 500 Server Error

**Admin additional MVP (2 screens):**
- ADM-24 Audit Log Viewer (CONVENTIONS makes audit logging mandatory; needs a UI)
- ADM-31 API Keys Management (issue/rotate/revoke service-to-service keys)

**Contractor additional MVP (3 screens):**
- CON-01 My Profile / Account
- CON-02 My Assigned Jobs (filtered work order list)
- CON-04 Offline Sync Queue (per CONVENTIONS offline rule)

Phase 2 and Phase 3+ screens (Subcontractor portal, Homeowner portal, Lead prospecting, Reports, etc.) are listed in `BULWARK_SCREENS_BY_ROLE.md` and are not yet specified here.

### Multi-Tenancy Note

Bulwark is multi-tenant. Every screen that displays tenant data implicitly operates inside one organization at a time. The Org Switcher (AUTH-05) handles users who belong to multiple organizations (super_admin, or any future multi-org user). All other screens assume the active organization is set in the session context.

---

## Part 6 — Build Approach (Frontend-First)

Bulwark is built **frontend-first** under this sequence:

1. **Phase 0 — Specification** is completed before any UI code: CONTRACTS.md, CONVENTIONS.md, DECISIONS.md, UI-CONTRACTS.md, full Drizzle schema, error taxonomy, Zod validators, Playwright stubs.
2. **Frontend** screens are then built against mock data conforming to the contracts.
3. **Backend** services are wired in incrementally, screen by screen, to those same contracts.
4. **QA** happens continuously as each screen is wired up.

Build environment: **VS Code + GitHub Copilot agentic AI team** following the prompt-driven workflow in `CONVENTIONS.md` Section 12.

### Implications for Wireframes and UI Specs

- Every screen, once specified, gets a `.github/ui-specs/[screen].md` file with `data-testid` map, required interactions, empty states, and error states.
- Every screen has an exported wireframe image in `agents/wireframes/[screen].png`.
- The frontend agent prompt for a screen reads: the spec file, the wireframe, the relevant Field Type Library entries from Part 1, the relevant UI-CONTRACTS components, and the Playwright test stub.
- Mock data in the frontend matches the Zod schemas in `validators/`. When the backend is wired, the mock layer is swapped out — no contract changes are required.

### Existing Wireframes

Wireframes for ~20 of the original 23 screens have been generated in UX Pilot AI. The 12 newly-identified MVP screens (8 Shared + 2 Admin + 3 Contractor minus the Field Dashboard already specified) need wireframes generated and exported into `agents/wireframes/` before their frontend prompts run.

---

*End of Bulwark UX Context Document v1.1*
*Update history:*
*- v1.0: Original 23-screen specification*
*- v1.1: Added Part 5 (Screens by User System) and Part 6 (Build Approach). Pointer to canonical `BULWARK_SCREENS_BY_ROLE.md` added.*
*Next revision: After partner open questions resolved — update assessment field labels, add county-specific data to dropdowns, confirm trade categories. Spec the 12 newly-identified MVP screens.*
