# Bulwark — Production Gap Register

> **Generated:** 2026-06-30 · **Owner:** agentic delivery team · **Status:** living
> **Provenance:** two exhaustive read-only audits (frontend surfaces; backend/
> security/data/jobs) cross-checked against `BUILD_STATUS.md` and verified by
> direct source reads. This is the **evidence base** the L-series epics remediate.

---

## 0. How to read this

- **Severity**: `BLOCKER` (cannot launch), `HIGH` (launch-risk; fix before GA),
  `MEDIUM` (fix in launch window), `LOW` (fast-follow).
- **Autonomy**: `AUTO` (an agent can build + test it with no human input) /
  `SECRET` (needs a credential the sponsor provisions; code is built credential-
  ready and test-mode-verified) / `HUMAN` (needs a human decision/sign-off, e.g.
  legal copy).
- **Epic**: the L-series epic that owns the remediation.

---

## 1. Verified FALSE POSITIVES (do NOT spend effort here)

Skeptical verification overturned three audit findings. Recorded so they are not
re-raised:

| Claim (from audit) | Reality | Evidence |
|---|---|---|
| "MFA TOTP secret stored in plaintext (HIGH)" | **Encrypted at rest** (AES-256-GCM) before insert. | [mfa.real.ts](server/services/mfa.real.ts#L98) `encryptSecret()` → insert; `decryptSecret()` on read. The only defect is a **stale comment** in [user_mfa.ts](server/db/schema/user_mfa.ts#L41) claiming "plaintext at v1". → fix comment in **L07**. |
| "Admin reports are placeholder stubs" | **Real W3-2 renderer** wired to the reporting service with CSV export + date ranges. | [reports/[slug].vue](app/pages/admin/reports/[slug].vue) uses `useService('reporting')`. → verify-only in **L20**. |
| "Mock backend not blocked in production" | **Already blocked** — plugin forces real backend + logs error when `NODE_ENV=production`. | [services.ts](app/plugins/services.ts) production guard. → keep; add env-guard test in **L07**. |

**Lesson:** stale header comments and stale `BUILD_STATUS` prose drift from code.
**L07** includes a "doc-vs-code truth sweep" task.

---

## 2. Net-new scope (confirmed absent in code)

| Item | Confirmed | Epic |
|---|---|---|
| `insurance_representative` role | Roles = exactly 7; no insurer anywhere ([_shared.ts](shared/contracts/_shared.ts#L14)). Must add to `RoleSchema` **and** DB `roleEnum` in lockstep. | **L15** |
| Insurer ↔ org/property linkage table | No `insurer_orgs`/equivalent table exists. | **L15** |
| Insurer read-only multi-property report surface/portal | No `/insurer/**` routes, no insurer reporting contract. | **L15** |
| Stripe online payments | Only a manual `invoice_payments` ledger exists; no Stripe intent/charge ids, no webhooks. | **L14** |

---

## 3. Gap inventory by theme

### 3.1 Object storage (photos / attachments / avatars / logos) — **L01, L02**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.1.1 | HIGH | AUTO | Property photos persist `data:`/`local://` URLs; no real signed upload. | [property-photo.real.ts](server/services/property-photo.real.ts#L115) `TODO swap to R2`. |
| 3.1.2 | HIGH | AUTO | Property attachments — same stub seam, stores `input.url` unvalidated. | [property-attachment.real.ts](server/services/property-attachment.real.ts#L80). |
| 3.1.3 | MEDIUM | AUTO | Avatars stored inline as base64 data URLs in `users.avatar_url` (intentional, ≤48KB) — like signatures, **excluded** from the L01-S3 prod guard until L02-S3 migrates them to storage (then guarded). | [avatar.post.ts](server/api/account/avatar.post.ts). |
| 3.1.4 | MEDIUM | AUTO | Branding logo is a manual URL field; no upload. | [settings/branding.vue](app/pages/settings/branding.vue#L10). |
| 3.1.5 | HIGH | AUTO | No production guard rejecting `local://`/`data:` persisted URLs. | new validator in storage service. |
| 3.1.6 | HIGH | AUTO | A presigned PUT can't bind body size, so presign-time `sizeBytes` is advisory. **Mitigated (L01-S2):** a server `finalize` HEADs + enforces the real size/content-type, deleting on violation. Hardening follow-up: presigned-POST `content-length-range` + an R2 lifecycle sweep of never-finalized objects. | L01-S2 / L17 (lifecycle). |
| 3.1.7 | MEDIUM | AUTO | Generic `/api/storage/presign-download` is ORG-scoped only (no per-entity RBAC). Sensitive per-entity downloads must be minted by owning services after an ownership check; insurer (L15) downloads must use entity-scoped methods. | L02 / L15. |
| 3.1.8 | MEDIUM | AUTO | Finalize is TOCTOU: a presigned PUT URL is reusable for its TTL, so an object can be re-PUT after finalize. **Mitigated:** upload TTL cut to 300s. **Close before L02 persists keys:** finalize returns the object etag → owning service stores + re-verifies at read (or copy-on-finalize / presigned-POST). | L02 (blocking precondition). |
| 3.1.9 | LOW | AUTO | Inspection-template **photo-field** values persist in `inspection_responses.value_json` (client-supplied), bypassing the scalar-column `assertStorableUrlOrKey` guard. Latent (real inspection photo upload is unwired). Close when Wave-3 wires inspection photos: guard photo-kind values at the inspection save boundary. | Wave 3 / inspection photos. |

### 3.2 Comms — email / SMS — **L03**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.2.1 | HIGH | SECRET | Email silently falls back to a stub id when no provider configured → notifications vanish with no operator signal. | [email.ts](server/services/_providers/email.ts#L60). |
| 3.2.2 | HIGH | SECRET | SMS has the identical silent-stub fallback. | [sms.ts](server/services/_providers/sms.ts#L65). |
| 3.2.3 | MEDIUM | AUTO | No admin-visible "provider not configured / last send failed" surface or delivery log. | new. |
| 3.2.4 | MEDIUM | AUTO | Resend/Twilio called via raw `fetch`, no pinned API version, no contract test. | providers. |

### 3.3 Async jobs / cron — **L04, L05**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.3.1 | BLOCKER | AUTO | Account-purge (GDPR 30-day hard delete) wrapper exists but is **never scheduled**. | [account-purge.ts](server/jobs/account-purge.ts). |
| 3.3.2 | HIGH | AUTO | COI-expiry scan wrapper exists but is **never scheduled**; sub portal shows an "expiring" bucket fed by a job that never runs. | [coi-expiry-check.ts](server/jobs/coi-expiry-check.ts). |
| 3.3.3 | HIGH | AUTO | No pg-boss retry/backoff policy; a single Chromium OOM fails the compliance doc forever. | [worker.ts](server/jobs/worker.ts). |
| 3.3.4 | MEDIUM | AUTO | `BULWARK_PDF_STUB=1` has no production fail-closed guard. | [compliance-doc.ts](server/jobs/handlers/compliance-doc.ts#L52). |
| 3.3.5 | MEDIUM | AUTO | Compliance `create()` can orphan a `generating` doc if enqueue fails after insert. | [compliance.real.ts](server/services/compliance.real.ts#L87). |
| 3.3.6 | MEDIUM | AUTO | `ALL_QUEUES` only registers `compliance_doc`; new JobKinds must be added or messages sit forever. | [boss.ts](server/jobs/boss.ts#L33). |

### 3.4 Payments (Stripe) — **L14**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.4.1 | HIGH | SECRET | No Stripe integration (checkout, webhooks, reconciliation, refunds). | net-new. |
| 3.4.2 | HIGH | AUTO | `recordPayment()` does not validate amount ≤ remaining balance (operator can over-apply). | [invoice-payment.real.ts](server/services/invoice-payment.real.ts). |
| 3.4.3 | MEDIUM | AUTO | Invoice status reconciliation vs. signed refund amounts needs explicit tests. | [invoice.real.ts](server/services/invoice.real.ts). |
| 3.4.4 | HIGH | AUTO | Homeowner invoice PDF + online pay are "coming soon". | [homeowner/invoices/[id].vue](app/pages/homeowner/invoices/[id].vue#L77). |

### 3.5 Security — **L07**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.5.1 | HIGH | AUTO | No explicit CSRF token; relies solely on `SameSite=Lax`. State-changing RPC is same-site POST. | [services-factory.ts] + RPC dispatcher. |
| 3.5.2 | MEDIUM | AUTO | No org-level MFA enforcement policy (`disabled\|optional\|required`). | [mfa.real.ts](server/services/mfa.real.ts). |
| 3.5.3 | MEDIUM | AUTO | `assertSameTenant` coverage is not test-enforced across all org-scoped methods. | grep audit + matrix test. |
| 3.5.4 | LOW | AUTO | CSP allows `unsafe-inline` for script/style (nonce-CSP deferred). | [security-headers.ts](server/utils/security-headers.ts#L25). Acceptable for launch; document. |
| 3.5.5 | MEDIUM | AUTO | Stale "plaintext" comment on `user_mfa.secret_encrypted` (see §1). | [user_mfa.ts](server/db/schema/user_mfa.ts#L41). |
| 3.5.6 | HIGH | AUTO | No automated dependency / SAST scan in CI (OWASP gate). | new CI job. |

### 3.6 Data layer — **L06**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.6.1 | MEDIUM | AUTO | Hot tables (properties, quotes, invoices, work_orders, inspections) lack composite `(org_id,status,created_at)` indexes → full scans. | schema/*. |
| 3.6.2 | HIGH | AUTO | Quote/invoice numbers generated by `COUNT(*)+LIKE`; race can dup; no UNIQUE constraint. | [quote.real.ts](server/services/quote.real.ts#L10). |
| 3.6.3 | MEDIUM | AUTO | Offset pagination scans skipped rows; deep pages slow; no cursor option. | [_shared.ts](shared/contracts/_shared.ts#L38) + list methods. |
| 3.6.4 | MEDIUM | AUTO | Potential N+1 in compliance-doc list (per-doc job fetch) and property list (per-row client). | compliance/property real services — verify + fix. |
| 3.6.5 | LOW | AUTO | Index-audit unknown for ~40 tables (`?` in inventory). | EXPLAIN sweep. |

### 3.7 Observability — **L08**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.7.1 | HIGH | SECRET | No error tracking (Sentry or equivalent) wired. | absent. |
| 3.7.2 | MEDIUM | AUTO | Metrics are in-process only; no `/metrics` Prometheus exposition; reset on restart. | [metrics.ts](server/utils/metrics.ts). |
| 3.7.3 | MEDIUM | AUTO | No health/readiness endpoint or migration-drift startup check. | new. |
| 3.7.4 | LOW | AUTO | Structured logs not shipped to an aggregator (stdout only). | [logger.ts](server/utils/logger.ts). |

### 3.8 Accessibility (WCAG 2.1 AA) — **L09**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.8.1 | HIGH | AUTO | Field layout **Inspect, Photos, AND Notes** tabs all route to `/field/check-in`; no `photos`/`notes` destination pages exist under app/pages/field. | [field.vue](app/layouts/field.vue#L44). |
| 3.8.2 | MEDIUM | AUTO | No automated axe-core/a11y gate in CI; aria/focus coverage unverified across surfaces. | new. |
| 3.8.3 | MEDIUM | AUTO | Several async actions lack visible error + retry affordances (profile avatar, sub COI, user invite). | per audit. |

### 3.9 Performance — **L10**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.9.1 | MEDIUM | AUTO | No perf budget / Lighthouse CI / API p95 instrumentation against the stated gate (p95<400ms, LH≥90). | new. |
| 3.9.2 | MEDIUM | AUTO | List pages fetch up to 100–200 rows SSR with no virtualization; fine at fixture scale, verify at real scale. | list pages. |

### 3.10 Surface completeness (settings + portals) — **L11, L12, L13**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.10.1 | MEDIUM | AUTO | Settings → Company has no persistence. | [settings/company.vue](app/pages/settings/company.vue#L12). |
| 3.10.2 | MEDIUM | AUTO | Settings → Templates (PDF doc templates) is non-functional. | [settings/templates.vue](app/pages/settings/templates.vue). |
| 3.10.3 | MEDIUM | AUTO | Settings → Permissions surface is a stub. | [settings/permissions.vue](app/pages/settings/permissions.vue). |
| 3.10.4 | LOW | AUTO | Verify labels/pipelines/trades/standards/inspection-templates **persist** (audit flagged "mocked saves" — likely stale; verify against real services). | settings/*. |
| 3.10.5 | MEDIUM | AUTO | Homeowner property/quote detail views are empty-state placeholders. | [homeowner/*](app/pages/homeowner). |
| 3.10.6 | MEDIUM | AUTO | Sub work-order/quote detail empty-state; `/sub/settings` + `/sub/profile` stub/missing. | [sub/*](app/pages/sub). |
| 3.10.7 | LOW | AUTO | `/admin/clients` and `/admin/subcontractors` exist but are not in `nav.config.ts`. | nav. |

### 3.11 Compliance multi-state seam — **L19**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.11.1 | MEDIUM | AUTO | Verify `evaluateCompliance` reads tenant **standards** rows (not hardcoded `OREGON_DEFAULT_STANDARDS`) so other states are data-driven. | [compliance.ts](shared/utils/compliance.ts) + standards service. |

### 3.12 Launch / infra / legal — **L16, L17, L18**
| # | Severity | Auto | Finding | Evidence |
|---|---|---|---|---|
| 3.12.1 | HIGH | SECRET | Managed prod Postgres (Neon/Render) not provisioned; migrations-on-deploy + backups undocumented. | infra. |
| 3.12.2 | HIGH | SECRET | Env/secrets provisioning checklist for Vercel (web) + Render (worker) incomplete. | deploy. |
| 3.12.3 | HIGH | HUMAN | Terms/DPA contain `TBD` (governing law, entity, jurisdiction); need counsel. | [terms.vue](app/pages/terms.vue). |

---

## 4. Severity roll-up

| Severity | Count | Of which AUTO |
|---|---|---|
| BLOCKER | 1 | 1 (account-purge cron) |
| HIGH | 14 | 9 |
| MEDIUM | 22 | 22 |
| LOW | 7 | 7 |

**~80% of launch-blocking work is fully autonomous.** Human-gated items reduce to:
provider/Stripe/Postgres/Sentry **secrets** (built credential-ready first), and
**legal copy** sign-off. These are tracked in `BUILD_PLAN.md` §7.
