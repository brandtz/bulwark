/**
 * server/services/comms/provider-http.ts — bounded HTTP calls to messaging
 * providers (WP-L03, gap register 3.2.4).
 *
 * # Decisions
 *   - Every attempt has a hard timeout so a hung provider cannot stall a
 *     request or a subscriber loop.
 *   - Retries are bounded (default 3 attempts, exponential backoff) and
 *     only for statuses the caller marks retryable. Providers without an
 *     idempotency key must not retry statuses that may already have sent.
 *   - Never throws: the caller turns the outcome into a ledger row.
 */

export interface ProviderRequest {
  url: string
  init: RequestInit
  /** HTTP statuses that are safe to retry for this provider. */
  retryOn: (status: number) => boolean
  /** Whether a network error (no response) may be retried safely. */
  retryNetworkErrors: boolean
  maxAttempts?: number
  timeoutMs?: number
  baseDelayMs?: number
}

export type ProviderResponse =
  | { ok: true, status: number, body: unknown, attempts: number }
  | { ok: false, status: number | null, error: string, attempts: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function callProvider(request: ProviderRequest): Promise<ProviderResponse> {
  const maxAttempts = Math.max(1, request.maxAttempts ?? 3)
  const timeoutMs = request.timeoutMs ?? 10_000
  const baseDelayMs = request.baseDelayMs ?? 250
  let last: ProviderResponse = { ok: false, status: null, error: 'request not attempted', attempts: 0 }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryable: boolean
    try {
      const res = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: true, status: res.status, body, attempts: attempt }
      }
      last = { ok: false, status: res.status, error: `HTTP ${res.status}`, attempts: attempt }
      retryable = request.retryOn(res.status)
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      last = { ok: false, status: null, error: timedOut ? `timed out after ${timeoutMs}ms` : 'network error', attempts: attempt }
      retryable = request.retryNetworkErrors
    }
    if (!retryable || attempt === maxAttempts) break
    await sleep(baseDelayMs * 2 ** (attempt - 1))
  }
  return last
}
