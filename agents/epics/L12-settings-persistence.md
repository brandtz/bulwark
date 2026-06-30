# L12 — Settings Persistence Completeness

> **Phase:** A (Wave 4) · **Autonomy:** AUTO · **Depends on:** L01
> **Owns gap-register:** §3.10.1–3.10.4 · **Decision:** ADR-0010 (truth sweep)

## Purpose
Several settings surfaces are non-functional or unverified: Company has no
persistence, Templates and Permissions are stubs, and the audit flagged labels/
pipelines/trades/standards "mocked saves" (likely stale — must be verified against
the real services). This epic finishes real persistence for the launch-required
settings and removes/relabels anything genuinely deferred.

## Stories

### L12-S1 — Settings persistence truth sweep (verify-first)
- **Task:** for labels, pipelines, trades, standards, inspection-templates, numbering,
  programs, users, feature-flags, providers, webhooks, saved-views — confirm the page calls
  a **real** service that persists (the audit claimed "mocked"; gap-register §1 shows that
  audit drifted from code). Produce a per-page PASS/FIX table.
- **Acceptance:** an accurate matrix of which settings persist vs. need work (drives S2–S4).

### L12-S2 — Company settings persistence
- **Contract/Server:** `org` update for name + GC license + contact fields via org-settings/
  org service; audited.
- **Client:** `settings/company.vue` editable + save + success state.
- **Tests:** e2e — edit company name → persists across reload; admin-only.

### L12-S3 — Document templates (PDF) configuration
- **Contract/Server:** template config (header/footer/accent/terms text) per doc kind stored
  per org; consumed by L11 composers.
- **Client:** `settings/templates.vue` editor with live preview.
- **Tests:** e2e — edit a template → reflected in generated PDF (ties to L11).

### L12-S4 — Role permissions surface (scope to launch need)
- **Decision:** fine-grained per-user grants stay out of launch; this story makes
  `settings/permissions.vue` a **truthful read-only matrix** of role→capability (from the
  default-permissions source) instead of a non-functional stub, with a clear "request a
  change" note. (Net-new editable overrides = post-launch.)
- **Tests:** e2e — matrix renders correct capabilities per role; no dead controls.

### L12-S5 — Nav + dead-stub cleanup
- **Client:** add `/admin/clients` + `/admin/subcontractors` to `nav.config.ts` (they exist
  but are unlinked); remove or relabel any remaining non-functional setting cards so nothing
  ships as a broken placeholder.
- **Tests:** persona×nav matrix — every linked route resolves for its allowed roles.
- **Acceptance:** every settings card either works or is honestly labeled/removed; no dead links.
