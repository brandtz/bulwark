/**
 * server/middleware/request-context.ts — assign requestId + log timing
 * (W3-5 / EH-Q / ADR-0034).
 *
 * # Decisions (ADR-0008, ADR-0034)
 *   - One `requestId` per inbound request stored on
 *     `event.context.requestId`. Generated with `crypto.randomUUID()`
 *     so we don't take a `uuid` dep.
 *   - Logs `request.start` on the way in and `request.complete` on
 *     the way out with `{ requestId, method, path, status,
 *     durationMs }`. Failures still emit `request.complete` via the
 *     `onAfterResponse` hook (defineEventHandler awaits it before
 *     unwinding).
 *   - Per ADR-0034 we do NOT log request bodies. Headers are summed
 *     (count) rather than serialized; cookies and auth headers
 *     would otherwise leak into the log stream.
 *   - Increments `requests_total` on every request and
 *     `requests_errored_total` when the response status ≥ 500.
 */
import { randomUUID } from 'node:crypto'
import { log } from '../utils/logger'
import { incCounter, COUNTERS } from '../utils/metrics'

export default defineEventHandler((event) => {
  const requestId = randomUUID()
  event.context.requestId = requestId
  const startedAt = Date.now()
  const method = event.method ?? event.node.req.method ?? 'GET'
  const url = event.node.req.url ?? '/'
  // Strip the query string from the logged path; query keys could
  // contain user input we don't want in the log stream.
  const path = url.split('?')[0] ?? url

  log('info', 'request.start', { requestId, method, path })
  incCounter(COUNTERS.requestsTotal)

  event.node.res.on('finish', () => {
    const status = event.node.res.statusCode
    if (status >= 500) incCounter(COUNTERS.requestsErroredTotal)
    log(status >= 500 ? 'error' : 'info', 'request.complete', {
      requestId,
      method,
      path,
      status,
      durationMs: Date.now() - startedAt,
    })
  })
})
