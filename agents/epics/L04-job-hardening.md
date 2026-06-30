# L04 — Async-Job Hardening

> **Phase:** A (Wave 1) · **Autonomy:** AUTO · **Depends on:** —
> **Owns gap-register:** §3.3.3–3.3.6 · **Decision:** ADR-0005

## Purpose
The pg-boss worker runs jobs once with no retry; a single transient failure (e.g.
Chromium OOM during PDF render) fails a compliance document permanently. The PDF
stub has no production guard, the compliance `create()` can orphan a `generating`
row, and only one JobKind is registered. This epic makes the job system
production-grade: retries with backoff, idempotency, OOM resilience, prod guards,
and reconciliation — the substrate L05 (crons) and L11 (PDFs) build on.

## Key decisions
- Central job config `server/jobs/policy.ts`: per-JobKind `{ retryLimit, retryDelay,
  retryBackoff, expireInSeconds }`. Default 3 retries, exponential (60s base).
- All handlers must be **idempotent** (documented contract); compliance handler keys
  R2 object by `docId` so re-runs overwrite safely.
- **Prod fail-closed:** worker startup throws if `NODE_ENV=production && BULWARK_PDF_STUB=1`.
- **OOM resilience:** Puppeteer launch flags + per-render timeout + a circuit-breaker
  that marks a doc `failed` (with reason) after N consecutive failures instead of looping.
- **Reconciliation:** a sweep marks docs stuck in `generating` with no live job as
  `failed` (operator-recoverable), and supports re-enqueue.

## Stories

### L04-S1 — Retry/backoff policy on all JobKinds
- **Server:** `policy.ts`; `worker.ts` passes policy to `boss.work(...)`. Apply to
  `compliance_doc`.
- **Tests:** integration — a handler that throws twice then succeeds completes after
  retries; a handler that always throws lands in pg-boss dead state and the doc is marked
  `failed`.
- **Acceptance:** retried jobs visible; no permanent loss on transient failure.

### L04-S2 — Production stub guards (worker entry; logic owned by L07-S4)
- **Server:** the worker boot calls the **single consolidated `env-guard` from L07-S4** (do not
  duplicate the rules here) to refuse `BULWARK_PDF_STUB=1` / `BULWARK_STORAGE_DRIVER=fs` when
  `NODE_ENV=production`. If L07-S4 hasn't landed yet, add a minimal inline guard and replace it
  with the shared one when L07 arrives.
- **Tests:** unit — simulated prod env with stub flags throws at worker boot; dev unaffected.

### L04-S3 — Compliance render OOM resilience + timeout
- **Server:** `compliance-doc.ts` handler — add Chromium `--disable-dev-shm-usage` (verify),
  `protocolTimeout` + an `AbortSignal`/page timeout; on timeout kill + throw (→ retry);
  circuit-breaker after 3 consecutive failures marks doc `failed`.
- **Tests:** integration under `BULWARK_PDF_STUB` simulating a thrown render; doc transitions
  `generating`→`failed` with a reason after breaker trips.
- **Acceptance:** worker survives a forced render failure; no zombie process.

### L04-S4 — Orphaned-doc reconciliation + re-enqueue
- **Server:** `compliance.real.ts` — wrap insert+enqueue so an enqueue failure rolls back
  the doc (or marks it `draft`); add `reconcileGenerating({ olderThanMin })` that fails
  orphans and a `reenqueue(docId)` admin action; `server/jobs/reconcile-compliance.ts`.
- **Tests:** integration — a doc inserted with a failed enqueue is reconciled to `failed`;
  re-enqueue produces a fresh job.
- **Acceptance:** no doc can sit `generating` forever; admin can recover.

### L04-S5 — JobKind registry guard
- **Server:** `boss.ts` — `ALL_QUEUES`/`HANDLERS` derived from one typed registry so adding
  a JobKind without a handler is a typecheck error.
- **Tests:** unit — registry exhaustiveness; missing handler fails to compile/throws at boot.
