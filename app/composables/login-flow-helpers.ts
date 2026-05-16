/**
 * app/composables/login-flow-helpers.ts — pure state machine for the
 * login page (W4-1 / EH-I).
 *
 * Decisions:
 *   - The page renders three exclusive panels: `idle` (email+password
 *     form), `mfaRequired` (6-digit input + backup-code escape hatch),
 *     and `locked` (banner with a live countdown). The transitions are
 *     pure functions of the previous service result, so tests can
 *     exercise them without mounting Vue.
 *   - `success` is terminal — the page navigates away the moment it's
 *     reached, so we never have to render anything for it. Kept as a
 *     state so tests can assert "we got there".
 *   - `error` is a sibling-state because it can co-occur with `idle`
 *     (bad password, retry inline). It is intentionally a separate
 *     scalar, not a fourth state.
 */
import type { AuthLoginResult } from '~~/shared/contracts/auth'

export type LoginStep =
  | { kind: 'idle' }
  | { kind: 'mfaRequired'; mfaToken: string; email: string }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'success' }

/**
 * Reduce the result of `auth.login()` into the next step. Returns
 * `null` when the result is a domain-success that should drive a
 * navigation (caller decides).
 */
export function stepFromLoginResult(result: AuthLoginResult): LoginStep {
  if (result.kind === 'mfa_required') {
    return { kind: 'mfaRequired', mfaToken: result.mfaToken, email: result.email }
  }
  return { kind: 'success' }
}

/**
 * Reduce a thrown error into the next step. Returns `null` when the
 * error is just a flat "bad credentials" the page should surface inline
 * (caller keeps the previous step).
 */
export function stepFromLoginError(e: unknown): LoginStep | null {
  if (e instanceof Error && e.message === 'account_locked') {
    const retryAfterSeconds = (e as Error & { retryAfterSeconds?: number }).retryAfterSeconds ?? 60
    return { kind: 'locked', retryAfterSeconds }
  }
  return null
}

/** Format a seconds countdown as "Xm Ys" or "Ys". */
export function formatRetryAfter(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m}m` : `${m}m ${r}s`
}
