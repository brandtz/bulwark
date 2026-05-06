/**
 * app/composables/useComplianceDocPolling.ts (E7-S3).
 *
 * # Decisions (ADR-0008)
 *   - Thin Vue wrapper around `IComplianceDocService.syncFromJob`. The
 *     pure polling primitive (`pollUntilTerminal` in shared/utils) is
 *     keyed on the underlying Job, but the UI talks to the doc, so we
 *     keep a doc-shaped composable here. It maps every poll tick onto
 *     a ref the template can `v-if` against and stops cleanly on
 *     terminal status, abort, or component unmount.
 *   - We deliberately use `setInterval` (not `pollUntilTerminal`) here:
 *     reactive Vue state needs `triggerRef`-friendly updates and the
 *     polling cadence we want is also the spinner cadence the user sees.
 *     The pure helper continues to drive deterministic unit tests.
 *
 * # Decision cast down
 *   - Rejected: rolling polling into `useAsyncData`. asyncData fires
 *     once per nav; we need a follow-up ticker after the initial
 *     resolve. Splitting them keeps each composable's contract simple.
 *   - Rejected: SSE / websockets. Out of scope until E11.
 */
import { isTerminalComplianceDocStatus, type ComplianceDoc } from '~~/shared/contracts/compliance'

export interface UseComplianceDocPollingOptions {
  /** Poll interval in ms. */
  intervalMs?: number
  /** Hard cap before we give up (ms). */
  timeoutMs?: number
}

export function useComplianceDocPolling(
  doc: Ref<ComplianceDoc | null | undefined>,
  orgId: Ref<string>,
  opts: UseComplianceDocPollingOptions = {},
) {
  const intervalMs = opts.intervalMs ?? 400
  const timeoutMs = opts.timeoutMs ?? 30000

  const service = useService('complianceDoc')
  const polling = ref(false)
  const error = ref<string | null>(null)
  let timerId: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  function stop() {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
    polling.value = false
  }

  async function tick() {
    const current = doc.value
    if (!current) {
      stop()
      return
    }
    if (isTerminalComplianceDocStatus(current.status)) {
      stop()
      return
    }
    if (Date.now() - startedAt > timeoutMs) {
      error.value = 'Generation timed out.'
      stop()
      return
    }
    try {
      const updated = await service.syncFromJob(current.id, orgId.value)
      doc.value = updated
      if (isTerminalComplianceDocStatus(updated.status)) {
        stop()
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to sync compliance doc.'
      stop()
    }
  }

  function start() {
    if (polling.value) return
    if (!doc.value) return
    if (isTerminalComplianceDocStatus(doc.value.status)) return
    polling.value = true
    startedAt = Date.now()
    error.value = null
    // Fire once immediately so the user sees the first transition fast.
    void tick()
    timerId = setInterval(() => {
      void tick()
    }, intervalMs)
  }

  onBeforeUnmount(stop)

  return { polling, error, start, stop }
}
