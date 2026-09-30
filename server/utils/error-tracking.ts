/**
 * server/utils/error-tracking.ts — Sentry-compatible error capture
 * (WP-L08 S1, ADR-0007).
 *
 * # Decisions
 *   - **No-op without `SENTRY_DSN`.** Nothing is sent, nothing is buffered, so
 *     this ships before the sponsor provisions a project.
 *   - **Envelope over fetch, no SDK.** One POST per event to the DSN's
 *     `/api/<project>/envelope/` endpoint. The full SDK adds ~1 MB of server
 *     bundle and global instrumentation we do not need for error capture;
 *     tracing can adopt the SDK later without changing call sites
 *     (`captureException` is the only entry point).
 *   - **Scrubbed.** Context goes through the logger's `redactFields` (tokens,
 *     passwords, `*_encrypted`, ...); the message and stack go through
 *     `scrubText` (query params, conflicting key values, emails, tokens);
 *     request bodies and headers are never attached.
 *   - **Once per error.** A WeakSet dedupes the dispatcher's direct capture
 *     against the Nitro `error` hook seeing the wrapped 500.
 *   - **Never throws.** Transport failures are logged and swallowed; error
 *     reporting must not turn one failure into two.
 */
import { randomUUID } from 'node:crypto'
import { log, redactFields } from './logger'

interface ParsedDsn { endpoint: string, publicKey: string, dsn: string }

export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\/+|\/+$/gu, '').split('/').pop()
    if (!u.username || !projectId) return null
    const prefix = u.pathname.replace(/\/?[^/]+\/?$/u, '')
    return { endpoint: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/`, publicKey: u.username, dsn }
  } catch {
    return null
  }
}

const captured = new WeakSet<object>()

/** Mark an error (e.g. the H3Error wrapping an already-captured cause) so hooks skip it. */
export function markCaptured(err: unknown): void {
  if (err && typeof err === 'object') captured.add(err)
}

export interface CaptureContext {
  requestId?: string
  route?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

type Fetcher = (url: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ ok: boolean, status: number }>

/**
 * Scrub free text (exception message, stack) before it leaves the process.
 * `redactFields` only sees keys; messages carry values: Drizzle appends the
 * bound parameters (`params: a@b.com,...`) to a failed query, and Postgres
 * echoes the conflicting value in `Key (email)=(a@b.com)`. Exported for tests.
 */
export function scrubText(text: string): string {
  return text
    .replace(/^(\s*params:).*$/gmu, '$1 [REDACTED]')
    .replace(/(Key \([^)]*\)=\()[^)]*\)/gu, '$1[REDACTED])')
    .replace(/Bearer\s+[\w.~+/-]+=*/giu, 'Bearer [REDACTED]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/gu, '[JWT]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gu, '[EMAIL]')
}

/** Build the Sentry envelope body for one error event. Exported for tests. */
export function buildEnvelope(err: unknown, ctx: CaptureContext, dsn: ParsedDsn, now = new Date()): string {
  const e = err instanceof Error ? err : new Error(String(err))
  const eventId = randomUUID().replace(/-/gu, '')
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tags: { ...(ctx.tags ?? {}), ...(ctx.route ? { route: ctx.route } : {}) },
    extra: redactFields({ ...(ctx.extra ?? {}), requestId: ctx.requestId, stack: e.stack ? scrubText(e.stack.slice(0, 8000)) : undefined }),
    exception: { values: [{ type: e.name || 'Error', value: scrubText(e.message.slice(0, 2000)) }] },
  }
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: dsn.dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n') + '\n'
}

/**
 * Report an error. Resolves when the send finishes (or immediately when
 * disabled). Callers on a serverless request path should hand the promise to
 * `event.waitUntil` so the platform does not freeze the function mid-send.
 */
export async function captureException(err: unknown, ctx: CaptureContext = {}, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN)
  if (!dsn) return
  if (err && typeof err === 'object') {
    if (captured.has(err)) return
    captured.add(err)
  }
  try {
    const res = await fetcher(dsn.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=bulwark/1.0`,
      },
      body: buildEnvelope(err, ctx, dsn),
    })
    if (!res.ok) log('warn', 'error_tracking.send_failed', { status: res.status })
  } catch (sendErr) {
    log('warn', 'error_tracking.send_failed', { message: sendErr instanceof Error ? sendErr.message : 'unknown' })
  }
}
