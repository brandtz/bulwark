/**
 * server/api/services/[service]/[method].post.ts — RPC dispatcher (E11-S13).
 *
 * # Decisions (ADR-0004, ADR-0012)
 *   - Single dispatcher endpoint covers ~50 BulwarkServices methods
 *     instead of 50 hand-rolled files. The contract layer is the
 *     source of truth for method shape; this file just routes.
 *   - Body parsing is delegated to h3 `readBody`. Empty bodies map to
 *     `undefined` so zero-arg methods (e.g. `auth.currentUser()`,
 *     `auth.logout()`) work without special-casing.
 *   - Errors are surfaced as 400/403/404/500 with `statusMessage` set
 *     to the original error's message. Tenant violations are 403,
 *     "not found" / contract validation are 400, unknown
 *     service/method is 404, everything else is 500. The client
 *     proxy unwraps the message back into a plain `Error` so page
 *     code can keep matching on text.
 *   - We DO NOT enforce auth here — individual services apply the
 *     tenant firewall via their resolver. Public methods (login,
 *     requestPasswordReset, previewInvite, acceptInvite) work for
 *     unauthenticated callers by design.
 *
 * # Decision cast down
 *   - Encoding the input as querystring. Rejected — POST body keeps
 *     UUIDs / timestamps / nested filters intact without manual
 *     serialization. RPC is RPC, not REST.
 */
import { createRealServices } from '~~/server/utils/services-factory'
import type { BulwarkServices } from '~~/shared/contracts/services'
import { TenantViolationError } from '~~/shared/mocks/tenant'

type ServiceMap = { [K in keyof BulwarkServices]: BulwarkServices[K] }

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const serviceName = params.service as keyof ServiceMap | undefined
  const methodName = params.method as string | undefined

  if (!serviceName || !methodName) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown service.method' })
  }

  const services = await createRealServices(event)
  const target = services[serviceName] as unknown as Record<string, unknown> | undefined
  if (!target || typeof target !== 'object') {
    throw createError({ statusCode: 404, statusMessage: `Unknown service: ${serviceName}` })
  }

  const fn = target[methodName]
  if (typeof fn !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `Unknown method: ${String(serviceName)}.${methodName}` })
  }

  // Body shape: `{ args: unknown[] }` from the RPC proxy. Empty body or
  // missing args (e.g. unauth callers hitting login via curl) collapse to
  // an empty arg list — the contract's own validation will reject it.
  let args: unknown[] = []
  try {
    const body = await readBody(event)
    if (body && typeof body === 'object' && Array.isArray((body as { args?: unknown }).args)) {
      args = (body as { args: unknown[] }).args
    } else if (body && typeof body === 'object' && Object.keys(body as object).length > 0) {
      // Back-compat: callers (e.g. tests, curl) that POST a bare payload as the
      // single first arg. Keeps `auth.login` working from raw HTTP without a
      // wrapping `{args:[...]}` envelope.
      args = [body]
    }
  } catch {
    args = []
  }

  try {
    return await (fn as (...a: unknown[]) => unknown).apply(target, args)
  } catch (err) {
    if (err instanceof TenantViolationError) {
      throw createError({ statusCode: 403, statusMessage: err.message })
    }
    const msg = err instanceof Error ? err.message : 'Internal error'
    // Heuristic: contract / not-found errors are user-correctable (400);
    // everything else is a 500.
    const isUserError = /not found|invalid|unauthor|expired|already/iu.test(msg)
    throw createError({
      statusCode: isUserError ? 400 : 500,
      statusMessage: msg,
    })
  }
})
