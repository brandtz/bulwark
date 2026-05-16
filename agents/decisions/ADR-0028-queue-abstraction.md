# ADR-0028 — In-process queue abstraction with pg-boss promotion path

## Status

Accepted — 2026-05-15.

## Context

ADR-0022 left a "promote to pg-boss" debt on the webhook dispatcher.
W3-1 adds a second background workload (notification dispatch) that
would benefit from the same async semantics: retry, backoff, dead-
letter. We need a single abstraction so today's in-process retry loop
and tomorrow's durable queue look identical to callers.

## Decisions

### 1. Single `enqueueJob` API

- `server/services/_queue/index.ts` exposes:
  - `registerJobHandler(kind, handler)` — wire a handler at app start
    (currently from `server/plugins/event-subscribers.ts`).
  - `enqueueJob({ kind, payload, runAt?, maxAttempts? })` — produce a
    job.
- A handler is `async (payload) => void`. Throwing schedules a retry.

### 2. In-memory implementation today

- Implementation uses `setTimeout` with exponential backoff
  (`base * 2^attempt`, capped). Failures past `maxAttempts` are logged
  as a dead-letter (no on-disk DLQ in Phase 1).
- Process restart loses unprocessed jobs. Acceptable for Phase 1
  because (a) webhook deliveries also write a row to
  `webhook_deliveries` so an operator can hand-redrive, and
  (b) notifications are idempotent enough that re-emit on a new
  event will refire dispatch.

### 3. pg-boss promotion path

- The module documents a one-file swap: replace the in-memory loop
  with a pg-boss instance, keep `enqueueJob` and
  `registerJobHandler` signatures.
- Job payloads are already JSON-serializable (validated by the
  webhook job using only string/number/object fields).
- Handler registration is idempotent, so the promotion does not
  ripple through subscribers.

### 4. Webhook dispatcher migration

- The webhook subscriber no longer runs its own retry loop. It
  resolves matching webhooks, then enqueues one
  `'webhook.deliver'` job per match.
- `server/jobs/webhook-deliver.ts` owns the POST, the 3-attempt
  semantics, and the `webhook_deliveries` audit row. It is registered
  by side-effect import from the event-subscribers plugin.
- Notification fanout currently runs **synchronously** inside the
  subscriber — channels are fast (DB write, stub email, stub SMS) and
  do not justify queueing yet. Once real email/SMS providers land,
  per-channel dispatch will move to its own job kind.

### 5. Test helpers

- `__resetQueueForTests()` clears registered handlers and pending
  timers so unit tests start clean.
- `__waitForQueueDrain()` resolves once the in-flight set is empty,
  letting integration tests assert post-condition state.

## Rejected alternatives

- **pg-boss now**. Adds a runtime dep, a migration, and a
  configuration surface for a slice whose UX value (notifications)
  was the actual ask. Defer.
- **BullMQ / Redis**. Even more infra; we don't yet need cross-
  process distribution.
- **No abstraction — inline retry per subscriber**. The webhook
  retry loop already exists and is duplicative with the
  forthcoming notification retry. The abstraction pays for itself
  on the second use.

## Known debt

- No persistent queue → at-most-once semantics across crashes.
- No metrics / queue depth gauge.
- No admin "redrive failed job" UI.
- pg-boss adapter exists only as a comment block in
  `_queue/index.ts`; the migration ADR will be written when we
  actually do the swap.
