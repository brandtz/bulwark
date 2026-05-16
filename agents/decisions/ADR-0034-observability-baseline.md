# ADR-0034 — Observability baseline (logger, metrics, health/ready)

Status: Accepted (W3-5 / EH-Q)
Date: 2026-05-15

## Context

The W2-4 audit-log slice gave us per-entity history, but operational events
(jobs retrying, webhooks failing, requests slow) still landed in raw
`console.log` lines with no structure, no per-request correlation, and no
counters. We need a minimum viable observability layer so on-call (a) can
correlate a failing user action with the server log, (b) can answer
"how many webhooks are we delivering per minute?", and (c) can wire an
uptime monitor to a real readiness probe instead of polling `/`.

## Decision

1. **Structured logger** — `server/utils/logger.ts` exposes
   `log(level, message, fields)`. Emits one JSON line per call with shape
   `{ts, level, message, ...fields}`. Levels gate via
   `BULWARK_LOG_LEVEL` (default `info`). Sensitive keys
   (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`)
   are redacted to `[REDACTED]` before serialisation. No dependency.

2. **Request-context middleware** — generates a `requestId` per inbound
   request, stores on `event.context.requestId`, logs `request.start` and
   `request.complete` with `{requestId, method, path, status, durationMs}`.
   Strips the query string from the logged path so user input never
   leaks into the log stream.

3. **In-memory metric counters** — `server/utils/metrics.ts` exposes
   `incCounter(name, by?)`, `readCounter(name)`, `snapshotMetrics()`.
   Counters live in a `Map` keyed by name; reset on process restart.
   Wired into the queue (`jobs_enqueued_total`, `jobs_failed_total`),
   the webhook job (`webhooks_delivered_total`, `webhooks_failed_total`),
   the notification subscriber (`notifications_dispatched_total`), and
   the request-context middleware (`requests_total`,
   `requests_errored_total`).

4. **`audit.logSystemError`** — new method on `IAuditService` that writes
   an operational event into the audit log with `entityType='system'` and
   `action='state_change'`; the kind+message land in `metadata`. Best
   effort — the implementation must never throw (the audit-log filter
   page already supports filtering on entity type, so on-call can review
   recent system errors without a new screen).

5. **Endpoints**
   - `GET /api/health` (public): `{status:'ok', version, uptimeSeconds}`.
   - `GET /api/ready` (public): `SELECT 1`; 503 if unreachable.
   - `GET /api/metrics` (admin auth): JSON snapshot of counters.

6. **Surgical console replacement** — only the six high-traffic paths
   touched: `audit.real.ts`, the queue dispatch, the webhook job, the
   webhook dispatcher, the notification subscriber, and the
   request-context middleware. `server/services/_providers/{email,sms}.ts`
   and `server/jobs/worker.ts` retain their `console.*` calls (out of
   scope for this slice).

## Rejected alternatives

- **pino / winston**. Would give us child loggers, sinks, and rotation,
  but Phase 1 deploys to Render/Netlify where stdout aggregation already
  exists. The 80-line custom logger is enough; promotion path documented
  below.
- **OpenTelemetry SDK + collector**. Real solution for distributed
  tracing, but we have one process and no downstream services. Adding it
  now would be premature.
- **Prometheus text-format `/api/metrics`**. JSON is enough for the on-call
  curl-and-eyeball workflow; the Prom exporter is a Phase 2 swap.
- **Logging request bodies**. Refused on principle (PII + credential
  leakage). We log header count, not header values.

## Phase-2 promotion path

1. Replace `log()` with a thin wrapper over `pino` that keeps the same
   signature. The redact list moves into pino's `redact` option.
2. Add an OpenTelemetry HTTP/Node SDK; `requestId` becomes the `trace-id`
   header propagated to downstream services.
3. Add a `/api/metrics.prom` endpoint that re-serialises the same counter
   map in Prometheus text format. The JSON endpoint stays for humans.
4. Promote `audit.logSystemError` into its own `system_events` table once
   we want indexed queries on `kind`. Until then `metadata->>'kind'` is
   adequate.
