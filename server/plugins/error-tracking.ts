/**
 * server/plugins/error-tracking.ts — report unhandled 5xx errors
 * (WP-L08 S1). No-op without SENTRY_DSN; see server/utils/error-tracking.ts.
 *
 * 4xx errors are client mistakes, not incidents, and are skipped. The RPC
 * dispatcher captures its own failures with service/method context and marks
 * the wrapping 500 so this hook does not report it twice.
 */
import { captureException } from '../utils/error-tracking'
import { routeLabel } from '../utils/metrics'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, ctx) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status < 500) return
    const event = ctx?.event
    const path = event?.path ?? ''
    const pending = captureException(error, {
      requestId: event?.context?.requestId as string | undefined,
      route: path ? routeLabel(path) : undefined,
      tags: { status: String(status) },
    })
    event?.waitUntil?.(pending)
  })
})
