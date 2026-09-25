# Engineering Decisions Register (design open questions → binding answers)

> Every "Open questions for engineering" item in the received design SPECs, answered. These
> are **binding for implementation** unless superseded by an ADR. Reference the ED-id in code
> comments / PR descriptions where the decision shapes behavior. Format: ED-nnn · source screen ·
> question → **decision** · rationale · touches.
>
> Owner: Head Architect. Revisit only via a new ED entry that supersedes (never edit history).

## Cross-cutting decisions (apply everywhere)

| ID | Decision | Rationale |
|---|---|---|
| **ED-000** | **Retention windows are org-configurable with platform defaults**: in-app activity/notification/inspection lists show 90 days by default; full history always available via Export and via the audit log (never deleted). One setting `org_settings.ui_history_days` (30–365). | Answers SH-20, AD-20, AD-25 consistently; keeps in-app lists fast (L06 indexes) without losing data. |
| **ED-00A** | **Destructive interruption ladder is fixed platform-wide** per principles.html: L0 toast+undo (reversible single-record edits, status moves inside pipeline), L1 inline confirm (delete a draft, remove a line), L2 modal confirm with consequences list (void invoice, cancel job, archive property, revoke access, deactivate user), L3 typed confirmation (delete account, publish pipeline version that remaps statuses, delete price book category with items). Modules do not invent new levels. | SH-41 asked to confirm per module; one ladder is easier to test (persona×action matrix). |
| **ED-00B** | **Primary CTA rule**: the *most common next step* is primary; "Save & continue" variants are secondary unless analytics prove otherwise. Specifically AD-04 keeps "Save" primary / "Save & add property" secondary; AD-11 keeps "Create property" primary / "Create & start inspection" secondary. | Avoids designing to a hypothesis; cheap to flip later via label registry + one prop. |
| **ED-00C** | **Address/geocoding provider = Mapbox** (Geocoding v6 + Static/GL tiles). One provider for autocomplete (AD-11), map tiles (AD-10/AD-40 map toggle, SC-05, AD-81), and route ordering. Abstracted behind `IGeoService` with a `none` driver so the app runs without a key (map toggles disabled, address free-text). APN/parcel is *not* from the geocoder — parcel lookup stays the admin-toggleable scaffold (EH-E). | US-first, generous free tier, single vendor for tiles+geocode; fail-closed like other providers (ADR-0002). |
| **ED-00D** | **E-signature = in-house typed/drawn attestation** with name, checkbox consent, IP, UA, timestamp, document hash, stored as an immutable `signatures` row and rendered into the PDF. No third-party e-sign provider at launch. Typed signature is legally sufficient under ESIGN/UETA for these B2C contracts; a keyboard-only user types their name (AD-21 a11y). | Cost, offline-compatibility (field), and we already have `BulwarkSignaturePad`. Third-party (DocuSign) becomes an optional provider later if enterprise clients demand it. |
| **ED-00E** | **Uploads are scanned asynchronously** (ClamAV container in the worker or a cloud scanning API behind `IScanService`); file is downloadable by the uploader immediately but shows `scanning` badge to others until `clean`; `infected` → quarantined key + notification to org admin. | Blocking scan would break field offline queue UX; async-permissive matches ADR-0001 finalize pattern. |
| **ED-00F** | **Passwordless (magic link) is offered to client, subcontractor and stakeholder roles; staff (admin/manager/field) use password + MFA.** Invite acceptance for external roles shows both "Set a password" and "Email me a sign-in link". | Matches SH-04/HO-01/SB-09 intent; staff need MFA-capable credentials for ST-23 policy. |
| **ED-00G** | **Legal documents are platform-level with tenant header by default**; tenants may *additionally* attach their own Terms of Service PDF/URL shown to their clients (ST-02 field). `LegalDocument.owner ∈ platform|tenant` as Design modeled. | Counsel-approved platform copy (L18) must not be editable per tenant; contractors still need to present their own service terms to homeowners. |

## Packet A — shared screens

| ID | Screen | Question → Decision |
|---|---|---|
| ED-001 | SH-01 | "Keep me signed in" hidden when ST-23 sets an idle timeout → **Yes, hide it** (remember-me is incompatible with idle lockout). Offline cached sign-in → **requires device PIN/biometric via WebAuthn `userVerification: required`**; if unavailable, no offline sign-in (show "connect to sign in"). |
| ED-002 | SH-02 | Cooldown → **60 s per email + 5/min per IP** (existing rate-limit rules). |
| ED-003 | SH-03 | Strength → **zxcvbn-ts client-side for UX + server-side HIBP k-anonymity check on submit** (EH-I). Server is authoritative. |
| ED-004 | SH-04 | Client invites offer magic link → **Yes** (ED-00F). |
| ED-005 | SH-05 | super_admin "Browse all tenants" → **Yes**, as a separate `/admin/tenants` list reachable from the switcher footer; opens a tenant in a *support impersonation* session that is audit-logged and banner-marked (EH-I impersonate). |
| ED-006 | SH-06 | PWA splash matches root router → **Yes**; same SVG asset set under `public/brand/`. |
| ED-007 | SH-09b | Maintenance announced beforehand → **Yes**: `platform_announcements` (super_admin) render a `BulwarkBanner tone=info` in all shells with dismiss-per-user. |
| ED-008 | SH-10 | Sign-out with unsynced queue → **Warn (L2 modal listing pending items); allow**. Queue is per device and encrypted at rest with a device key; it survives sign-out and drains on next sign-in by the same user. |
| ED-009 | SH-11/12/13 | → ED-00G. |
| ED-010 | SH-14 | Tenant public URL → **From ST-02 `website` field**, fallback to Bulwark marketing URL. |
| ED-011 | SH-20 | Retention → ED-000. Severity filters for client/sub → **Hidden for client, shown for sub** (subs have COI/assignment severities worth filtering). |
| ED-012 | SH-21 | Search backend → **Single grouped endpoint** (`search.query` already exists) with per-entity limits (5) and a total budget 300 ms; client portal uses the same component with `scope=own`. |
| ED-013 | SH-22 | Column visibility/order part of view → **Yes** (`saved_views.layout_json`). Delete shared view → **creator or org_admin+** (manager cannot delete others' shared views). |
| ED-014 | SH-30 | Email change → **verify-new-address flow**: new email gets a link; old email gets notice; change applies on confirm. Ships with ST-23 work (EH-I). |
| ED-015 | SH-31 | Sessions list → **build it** (`user_sessions` table: id, ua, ip, created, last_seen, revoked). Trusted-device duration → **org-configurable in ST-23**, default 30 d, max 90 d. |
| ED-016 | SH-32 | Push as 4th channel → **Yes, add `push` column for all roles**, hidden until the PWA push subscription exists on that account (progressive disclosure). |
| ED-017 | SH-33 | Grace period → **fixed 30 days** (privacy policy commitment; org can't shorten a user's right). Export scope → **role-based subset**: own profile + records the user authored; org admins get a separate org-level export in ST (Data & compliance). |
| ED-018 | SH-40 | Install banner for Sub portal → **Yes, for Sub and Field** (both work on site); not for Admin/Client/Stakeholder. |
| ED-019 | SH-41 | → ED-00A. |

## Packet B — admin core

| ID | Screen | Question → Decision |
|---|---|---|
| ED-026 | AD-01 | Fourth KPI → **"Jobs in progress"** for launch (operational, always populated); "Avg. days to quote" becomes a report (AD-71 sales). Export → **visible KPIs + pipeline counts + alerts as CSV**. |
| ED-027 | AD-03 | Client types → **tenant-configurable via the label registry namespace `client.types`** with 4 seeded (Residential, Commercial, Property manager, HOA); each maps to a status hue. No new ST screen — ST-04 Labels covers it. |
| ED-028 | AD-04 | → ED-00B. Multiple billing contacts for HOA/commercial → **Yes**: contacts have `kind` + `is_billing` flag; invoice "Bill to" picks any billing contact. Handled in AD-05 Contacts tab. |
| ED-029 | AD-05 | Merge client → **dedicated flow in phase 3 (WP-B7)**: pick survivor, re-parent properties/quotes/invoices/contacts, keep loser as `merged_into`. Stakeholder grants shown → **property-only** (grants are property/org scoped, not client scoped). |
| ED-030 | AD-10 | Map layout → after ED-00C; toggle disabled until `IGeoService` has a key. WIP limits → **soft (warn badge), never block**. |
| ED-031 | AD-11 | → ED-00C, ED-00B. |
| ED-032 | AD-12 | Tab overflow at 1280 → **horizontal scroll with edge fade + a "More ▾" menu when >8 tabs**; both. Transfer client → **dedicated flow (WP-B7)** that re-parents open quotes/invoices with a confirm listing counts; closed records keep historical client snapshot. |
| ED-033 | AD-13 | Cancelling a property → **leaves invoices untouched, shows count in confirm**; voiding is an explicit invoice action. Reason requirements config → field is `status_pipelines.statuses[].requires_reason: boolean` (lives in ST-05, not ST-15 — Design's reference corrected). |
| ED-034 | AD-14 | "Main" renameable → **Yes**. |
| ED-035 | AD-15 | Section photo requirement → **Yes, as inspection-template field option `photo.minCount` scoped `per section`** (ST-08), not a building attribute. |
| ED-036 | AD-16 | Contact vs person → **Introduce `people` (org-scoped person: name, emails, phones) and make `contacts` a join (property_id, person_id, kind, is_primary, is_billing)**. Migration copies today's contact rows into people with dedupe by email. Same person on many properties without duplication; portal invites attach to the person. |
| ED-037 | AD-17 | Annotation → **arrows, boxes, text, blur** (Design's three + blur for PII); no measurements. Photo permissions → **inherit from source scope**: sub sees photos on slots assigned to them + shared-by-admin flag; client sees photos flagged `client_visible` (default true for before/after phases). |
| ED-038 | AD-18 | → ED-00E. |
| ED-039 | AD-19 | Permit scope → **property-scoped with optional many-to-many to jobs** (`permit_jobs`). Jurisdictions → **tenant catalog** seeded from ST-25 tax jurisdictions + free "Other". |
| ED-040 | AD-20 | → ED-000. Field roles see money events → **No** (persona matrix). |
| ED-041 | AD-21 | Typed attestation → ED-00D (yes). Copy-forward across template versions → **Yes for matching field keys; changed/removed keys flagged for review; never auto-copy signature/passfail/rating fields**. |
| ED-042 | AD-22 | "Pass with warnings" blocks sign-off → **No**; warnings are listed on the deliverable. Clients see remediation before a quote → **No**. |
| ED-043 | AD-23 | Starting an inspection auto-advances status → **No; submit advances** (existing behavior). Starting creates a `draft` visible in Open items. |
| ED-044 | AD-25 | → ED-000. |
| ED-045 | AD-30 | Free-text lines with remembered rates until price book → **Acceptable for phase 2**; `quote_line_items.catalog_item_id` nullable from day one so PB attaches later without migration. Tiers → **max 3, renameable**. |
| ED-046 | AD-31 | Sent-quote total column → **shows the recommended tier's total (or the single tier); tooltip lists all tiers**. Accepted → accepted tier. |
| ED-047 | AD-32 | → ED-00D. Hidden tiers remembered → **Yes, stored on the quote version** (`hidden_tiers[]`). |
| ED-048 | AD-33 | Skip picker from property context → confirmed (already so). |
| ED-049 | AD-34 | Approved CO auto-invoice → **No; rides the next invoice** (T&M jobs can add an invoice manually). Rejected CO → **Duplicate** (no re-propose state). |
| ED-050 | AD-40 | → ED-00C. Calendar layout → **reuse the dispatch scheduler in month view (SC-01)**; no separate calendar. |
| ED-051 | AD-41 | Past-dated starts → **allowed with L1 confirm**. Multi-crew per slot → **assignee = team OR individual OR sub** (one assignee per slot; a team is the way to put multiple people on a slot). Teams come from AD-63. |
| ED-052 | AD-42 | Materials read-only summary until PB/PO → **Acceptable**; `work_order_materials` table lands in phase 3 with PO module. All slots complete → **prompt ("Mark job complete?")**, never auto. |
| ED-053 | AD-43 | Partial completion reason → **optional note only**. Hours → **one total per submission; TT splits later**. |

## Decisions Design asked us to confirm elsewhere (already answered above)

- Client-type configurability → ED-027 · Fourth KPI → ED-026 · Map provider → ED-00C ·
  E-sign → ED-00D · Virus scan → ED-00E · Retention → ED-000 · Interruption levels → ED-00A.

## Numbering note

ED-020…ED-025 intentionally unassigned (reserved for Packet A addenda if the operator's manual
sign-off items in A6-CHECKLIST raise new questions).
