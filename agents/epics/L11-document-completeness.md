# L11 — Document Completeness (PDF)

> **Phase:** A (Wave 4) · **Autonomy:** AUTO · **Depends on:** L01, L04
> **Owns gap-register:** §3.4.4 (homeowner PDF) + compliance hardening · **Decision:** ADR-0005

## Purpose
Make every customer-facing document real and downloadable: the homeowner invoice PDF
is "coming soon", compliance docs need the hardened pipeline (L04) plus branded
output, and quotes/invoices should produce branded PDFs through the same async path
and storage service (L01).

## Key decisions
- Reuse the compliance PDF pipeline pattern (HTML composer → Puppeteer → storage → signed
  URL) generalized to a `document` JobKind with `kind ∈ compliance|invoice|quote`.
- Templates pull org branding (logo via L02 storage, colors, footer) so output is on-brand.
- Generation is async + idempotent (R2 key by entity id); the UI polls like compliance.

## Stories

### L11-S1 — Generalized document render JobKind
- **Server:** `document` JobKind + handler; HTML composers for invoice + quote (escape +
  brand); store to `documents/{org}/{kind}/{id}.pdf`; mirror status onto the entity.
- **Tests:** unit — HTML composer escaping + branding; integration under stub → ready.

### L11-S2 — Invoice PDF (admin + homeowner)
- **Server/Client:** invoice detail (admin) + `homeowner/invoices/[id].vue` gain a real
  "Download PDF" that triggers/polls generation and links the signed URL. Remove the
  "coming soon" label.
- **Tests:** e2e — request invoice PDF → ready → download href present; homeowner sees only
  their own.

### L11-S3 — Quote PDF
- **Server/Client:** quote preview gains "Download PDF" via the same path.
- **Tests:** e2e — quote PDF round-trip.

### L11-S4 — Compliance doc branding + hardening tie-in
- **Server:** compliance HTML composer adopts org branding; relies on L04 retries/OOM guard;
  signature size validated (≤1 MB) and escaped.
- **Tests:** integration — branded compliance doc renders under stub; oversize signature
  rejected at the contract.
- **Acceptance:** all three document kinds generate, store, and download via signed URLs.
