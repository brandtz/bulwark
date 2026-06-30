# L14 — Stripe Online Payments

> **Phase:** B (Wave 5) · **Autonomy:** SECRET (autonomous against Stripe **test mode**;
> live = key swap) · **Depends on:** L06, L11 · **Owns gap-register:** §3.4.1–3.4.4
> **Decision:** ADR-0003 · **Net-new feature**

## Purpose
Enable customers (and homeowners) to pay invoices online via **Stripe**. Today only a
manual `invoice_payments` ledger exists with no balance validation. This epic adds
hosted Stripe Checkout, signed webhook reconciliation, refunds, and online pay on the
homeowner invoice — with the ledger remaining the **source of truth** and all amounts
validated server-side. Built and tested entirely against **Stripe test mode**; going
live is a key swap the sponsor performs.

## Key decisions (ADR-0003)
- **Stripe Checkout (hosted)** for PCI scope minimization — no card data touches Bulwark.
- **Webhooks are the truth signal**: `checkout.session.completed` /
  `payment_intent.succeeded` / `charge.refunded` reconcile into `invoice_payments`;
  the success redirect is **not** trusted for state.
- **Idempotency:** Stripe idempotency keys on create; webhook handler dedupes by event id
  (`stripe_events` table) so replays are safe.
- **Amount integrity:** server computes amount due from the ledger; a payment can never
  exceed remaining balance; refunds are signed ledger rows.
- Provider config (publishable/secret keys, webhook secret) stored sealed in
  `provider_configs` (kind `stripe`) — reuses the W5-2 envelope encryption.

## Stories

### L14-S1 — Stripe config + client + env guard
- **Server:** `server/services/_providers/stripe.ts` typed wrapper (raw `fetch` or `stripe`
  SDK — pin version); read sealed keys from `provider_configs`; no-op/clear error when unset.
- **Tests:** unit — missing config → clear error; test keys → client constructs.

### L14-S2 — Webhook ingest + event dedupe
- **Server:** `server/api/webhooks/stripe.post.ts` — verify signature with the webhook
  secret; persist to `stripe_events(event_id unique, type, payload, processed_at)`; dispatch
  to handlers; **never** trust unsigned bodies.
- **Tests:** integration — replayed event id processed once; bad signature → 400.

### L14-S3 — Checkout session + balance-validated intent
- **Contract/Server:** `invoicePayment.createCheckout({ invoiceId, organizationId })` —
  `assertSameTenant`; compute remaining balance from the ledger via the L14-S6 helper, refuse
  if ≤ 0; create a test-mode Checkout session with an idempotency key and
  **`metadata: { invoiceId, organizationId }`** (also copied onto the `payment_intent` so
  `charge.refunded` can reconcile); return the URL.
- **Tests:** integration — over-balance refused; valid invoice returns a session with the
  metadata set; idempotent re-create returns the same session.

### L14-S4 — Reconciliation into the ledger
- **Decision (event→invoice key):** the webhook resolves the target invoice from
  **`event.data.object.metadata.invoiceId` + `.organizationId`** (set in S3) — never from a
  guessed convention. Ledger rows use **`method='card'` + a new `provider='stripe'` column**
  (the contract `InvoicePaymentMethodSchema` enum is NOT extended with `'stripe'`).
- **Server:** handlers for `checkout.session.completed`/`payment_intent.succeeded` call the
  L14-S6 orchestrator `recordPayment` with `{ invoiceId, organizationId, amountCents,
  method:'card', provider:'stripe', stripePaymentIntentId, stripeChargeId }`, which validates
  balance, inserts, and flips status via the existing derivation; `charge.refunded` records a
  **signed negative** ledger row.
- **Tests:** integration — a simulated successful payment marks the invoice paid; partial then
  remainder works; refund reduces paid total correctly; an event whose `metadata.invoiceId` is
  missing is rejected (no silent orphan).

### L14-S5 — Admin + homeowner pay UI
- **Client:** admin invoice detail "Collect payment" → Checkout; `homeowner/invoices/[id].vue`
  "Pay online" (replaces placeholder) → Checkout; return page shows a **pending→confirmed**
  state that resolves from webhook-updated status (not the redirect).
- **Tests:** e2e (test mode, mocked redirect) — initiate pay → simulate webhook → status flips
  to paid; homeowner sees only their invoice.

### L14-S6 — Balance-validated payment orchestrator (manual + Stripe funnel)
- **Server:** the **orchestrator** [invoice.real.ts](server/services/invoice.real.ts#L250)
  `recordPayment` (the one that knows the invoice total) is the single funnel for BOTH manual
  and Stripe payments. Add the **`amount ≤ remaining balance` check BEFORE the ledger insert**
  (today it clamps to 0 only AFTER inserting — gap §3.4.2). Extend its input with
  `provider: 'manual'|'stripe'` + optional `stripePaymentIntentId`/`stripeChargeId`; add the
  `provider` + stripe-id columns to `invoice_payments` and update the now-stale `method`
  comment. The low-level `invoice-payment.real.ts#recordPayment` stays insert-only and is only
  called via the orchestrator.
- **Tests:** integration — manual over-payment refused **before** insert; manual + stripe rows
  coexist and reconcile; deposit→partial→full→refund sequence yields correct status.
- **Acceptance:** full pay-cycle reconciles correctly across manual + Stripe; webhooks are the
  authority; everything green against a **mocked Stripe client / test mode**.

## Human-gated (sponsor) — built-ahead state
- **Truly AUTO:** the Stripe **client is mocked** in unit/integration tests, so webhook-
  signature verification, Checkout-session creation, metadata reconciliation, balance
  validation, and refund math are all built + tested with **no sponsor secret** (recorded
  fixtures + a fake signing secret). This keeps Wave 5 autonomous.
- **SECRET (sponsor):** real Stripe account + `sk_test_…`/`sk_live_…` keys + webhook signing
  secret to run a live test-mode e2e and to go live. Live launch = paste keys + register the
  prod webhook endpoint. No code change.
