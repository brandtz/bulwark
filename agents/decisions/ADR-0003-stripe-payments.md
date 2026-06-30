# ADR-0003 — Stripe Checkout + webhook reconciliation; ledger is truth

- **Status:** Accepted (2026-06-30) · **Epic:** L14

## Context
Launch requires online invoice payment. Only a manual `invoice_payments` ledger exists,
with no balance validation and no payment provider.

## Decision
Use **Stripe hosted Checkout** (cards never touch Bulwark → minimal PCI scope).
**Webhooks are the authoritative signal** — `checkout.session.completed` /
`payment_intent.succeeded` / `charge.refunded` reconcile into `invoice_payments`; the
browser success redirect is never trusted for state.
- **Event→invoice key:** Checkout is created with `metadata: { invoiceId, organizationId }`
  (threaded onto the `payment_intent`); the webhook resolves the invoice from that metadata —
  never a guessed convention.
- **Ledger shape:** payments use **`method='card'` + a new `provider` column
  (`manual|stripe`)**; the `InvoicePaymentMethodSchema` enum is NOT extended with `'stripe'`.
  New `stripePaymentIntentId`/`stripeChargeId` columns carry the Stripe ids.
- **One funnel, validated before insert:** both manual and Stripe payments go through the
  `invoice.real.ts#recordPayment` orchestrator, which checks `amount ≤ remaining balance`
  **before** inserting (the current code clamps only after insert).
- **Idempotency:** Stripe idempotency keys on create + a `stripe_events(event_id unique)`
  dedupe table for safe replays. **Refunds** are signed negative ledger rows.
Keys/webhook secret are sealed in `provider_configs` (kind `stripe`). Built/tested against a
**mocked Stripe client** (autonomous) and Stripe **test mode**; live = key swap.

## Consequences
- Correct, replay-safe money movement; the ledger stays the single source of truth.
- Manual + Stripe payments coexist via a `provider` column.

## Alternatives rejected
- Stripe Elements/custom card form (raises PCI scope). Trusting the redirect for state
  (loses payments on closed tabs). Status on the invoice as truth (ledger is auditable).
