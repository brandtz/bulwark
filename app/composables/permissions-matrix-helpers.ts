/**
 * app/composables/permissions-matrix-helpers.ts — pure tri-state cycle
 * helper for the permissions matrix UI (W4-1 / EH-I / ADR-0025).
 *
 * Decision (ADR-0025 §override semantics):
 *   - `default` = no row in DB; the role's static default applies.
 *   - `granted` = override row with `allowed=true`.
 *   - `denied`  = override row with `allowed=false`.
 *   - Clicking a cell cycles `default → granted → denied → default`.
 *
 * The vitest unit drives `cycleCellState` directly so the cycle order
 * stays locked.
 */
export type CellState = 'default' | 'granted' | 'denied'

export function cycleCellState(state: CellState): CellState {
  if (state === 'default') return 'granted'
  if (state === 'granted') return 'denied'
  return 'default'
}

/**
 * Translate (override allowed flag | undefined) → tri-state. `undefined`
 * means "no override row" (i.e. fall back to the static default).
 */
export function deriveCellState(overrideAllowed: boolean | undefined): CellState {
  if (overrideAllowed === undefined) return 'default'
  return overrideAllowed ? 'granted' : 'denied'
}
