# Bulwark operations runbook

Written for whoever is on call for production (https://bulwark-chi.vercel.app). It covers the
signals the app exposes, how to set up monitoring on them, and what to do when they fire.
From WP-L08 (epic `agents/epics/L08-observability.md`).

## Signals

| Endpoint | Auth | What it tells you |
|---|---|---|
| `GET /api/health` | public | Liveness: the function boots and responds. Cheap; use it for uptime checks. |
| `GET /api/ready` | public | Readiness. Returns `{ ready, migrationsOk, configOk }`, or 503 when the database is unreachable **or migrated behind the deployed code**. |
| `GET /api/metrics` | admin session, or `Authorization: Bearer $BULWARK_METRICS_BEARER` | JSON counters plus per-route p50/p95 latency. Add `?format=prometheus` for Prometheus text. |
| `GET /api/health/storage` | org admin | Storage driver, a probe round trip, and a census of legacy `data:`/`local://` rows. |
| Request logs | Vercel log drain | One JSON line per request: `request.complete` with `route`, `status` and `durationMs`. Unexpected RPC failures log as `rpc.unhandled`. |
| Error tracking | set `SENTRY_DSN` | Unhandled 5xx errors, RPC failures (tagged with service and method) and worker job failures. Nothing is sent while the DSN is unset. |

Metrics are kept in each server instance's memory. On Vercel every instance reports only
its own counters, and they reset on cold start. Treat them as a live sample. For trends
over time, aggregate `durationMs` from the request logs.

## Set up once

1. **Uptime check.** Point any external monitor (Better Uptime, UptimeRobot, Checkly, …) at
   `GET /api/ready` every minute. Alert after 2 consecutive failures, because a single 503
   can be a cold start timing out. Add a second check on `/api/health` so you can tell
   "app down" apart from "app up but not ready".
2. **Error tracking.** Create a Sentry project and set `SENTRY_DSN` in Vercel (Production).
   Release tags come from `VERCEL_GIT_COMMIT_SHA` automatically. The worker needs the same
   variable wherever it runs.
3. **Metrics scraping (optional).** Set `BULWARK_METRICS_BEARER` to a long random value and
   scrape `/api/metrics?format=prometheus` with that bearer token.

## Alert thresholds

| Alert | Condition | Severity |
|---|---|---|
| Not ready | `/api/ready` non-200 for 2 consecutive minutes | page |
| Down | `/api/health` non-200 for 2 consecutive minutes | page |
| Error spike | more than 5 new Sentry issues or more than 20 events in 10 minutes | page |
| Job-failure streak | the worker records 3 consecutive failures of one job kind (the existing failure alert) | ticket |
| Slow endpoint | p95 of an RPC route above 1500 ms over 15 minutes (the L10 budget) | ticket |
| Brute force | `auth_failures_total` rising faster than 50/min, or a burst of `rate_limit_blocks_total` | ticket |

## Playbooks

### `/api/ready` returns 503 with `migrationsOk: false`
The deployed code expects a newer migration than the database has. Pages that touch new
tables or columns will fail.
1. Find the newest file in `server/db/migrations/` on the deployed commit.
2. Apply it to production Neon with the same process used for earlier migrations. It must be
   recorded in `drizzle.__drizzle_migrations`, which `drizzle-kit migrate` does
   automatically. If you apply the SQL by hand, you also have to insert that bookkeeping row.
3. Recheck `/api/ready`. Rule for the future: apply migrations **before** pushing code that
   depends on them.

### `/api/ready` returns 503 without `migrationsOk` (`{ ready: false }` only)
The database is unreachable. Check Neon status and whether the compute is suspended, then
the `DATABASE_URL` in Vercel. Logs show `readiness.check_failed` with the driver message.

### `configOk: false`
The environment guard found unsafe production configuration. For example: the mock
backend or stub PDFs are enabled, uploads go to the local filesystem, login throttling is
off, `NUXT_SESSION_PASSWORD` or `JWT_SECRET` is weak, or `DATABASE_URL` is missing or local. The server logs the specific findings at boot, so check
the Vercel function logs from the latest deploy. Set `BULWARK_ENV_GUARD=enforce` to refuse
to boot instead of only warning.

### Uploads fail in the browser
Signs: the photo, attachment, avatar or logo upload fails with "Failed to fetch", or the
PUT to R2 fails CORS in devtools. Add a rule to the R2 bucket's CORS policy that allows
`PUT` with header `content-type` from the app origin. See `docs/DATA_LAYER.md` and
WP-L02 in the registry.

### Error spike after a deploy
Roll back from the Vercel dashboard ("Promote" the previous deployment). Migrations are
additive, so older code runs against a newer database: `/api/ready` stays green while the
database is ahead of the code. Then triage in Sentry by the `service` and `method` tags.
