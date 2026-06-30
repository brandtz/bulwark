# L18 — Legal & Content Finalization

> **Phase:** C (Wave 6) · **Autonomy:** S1+S2 AUTO (land ahead), S3 HUMAN (counsel) · **Depends on:** —
> **Owns gap-register:** §3.12.3 · **Decision:** ADR-0010

## Purpose
The Terms of Service and DPA contain `TBD` tokens (governing law, legal entity,
jurisdiction) and a hard-coded effective date. These require human/counsel input.
This epic prepares everything so the only remaining action is pasting approved copy.

## Stories

### L18-S1 — TBD inventory + content map
- **Task:** enumerate every `TBD`/placeholder across `terms.vue`, `dpa.vue`, `privacy.vue`,
  `goodbye.vue` with the exact value needed (entity name, governing law, jurisdiction,
  effective date, support contact); produce `docs/LEGAL_CHECKLIST.md`.
- **Acceptance:** a single checklist the sponsor/counsel fills in.

### L18-S2 — Templated legal copy + effective-date mechanism
- **Client:** replace inline `TBD` with values sourced from a single config (org legal
  profile) so updating copy is one edit, not a hunt; effective date from config.
- **Tests:** e2e — pages render with config values; no `TBD` remains when config is complete.

### L18-S3 — Counsel sign-off gate (human)
- **Process:** mark the pages "draft — pending counsel" until the sponsor confirms approval;
  a launch checklist item blocks GA until cleared.
- **Acceptance:** sponsor-provided, counsel-approved copy is in; launch checklist item closed.
