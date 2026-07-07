/**
 * server/jobs/failure-alert.ts — consecutive-failure alert tracker (L05-S4).
 *
 * # What this file does
 *   - Pure, per-kind consecutive-failure counter. The worker records each
 *     terminal handler outcome; when a kind fails `threshold` times in a row
 *     the tracker reports `shouldAlert: true` exactly ONCE per losing streak
 *     (re-arming only after a success), so operators get one signal per
 *     incident instead of one per retry.
 *
 * # Decisions
 *   - Pure class, no I/O — the worker owns what an "alert" does (system-error
 *     audit row today; Sentry capture when L08 lands). This file stays
 *     unit-testable with zero infrastructure.
 *   - Threshold defaults to 3 (ADR-0005): with retryLimit 3 per job, three
 *     consecutive terminal failures means at least three separate messages
 *     have burned all retries — a real outage, not noise.
 */
export interface FailureAlertOutcome {
  /** Consecutive failures for this kind, after recording this outcome. */
  streak: number
  /** True exactly once per streak, when it first reaches the threshold. */
  shouldAlert: boolean
}

export class ConsecutiveFailureTracker {
  private streaks = new Map<string, number>()
  private alerted = new Set<string>()

  constructor(private readonly threshold = 3) {}

  recordSuccess(kind: string): FailureAlertOutcome {
    this.streaks.set(kind, 0)
    this.alerted.delete(kind)
    return { streak: 0, shouldAlert: false }
  }

  recordFailure(kind: string): FailureAlertOutcome {
    const streak = (this.streaks.get(kind) ?? 0) + 1
    this.streaks.set(kind, streak)
    if (streak >= this.threshold && !this.alerted.has(kind)) {
      this.alerted.add(kind)
      return { streak, shouldAlert: true }
    }
    return { streak, shouldAlert: false }
  }
}
