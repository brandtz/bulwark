/**
 * app/components/views/saved-views-helpers.ts — pure helpers for the
 * saved-views menu (W4-1 / EH-P / ADR-0033).
 *
 * Why this exists separately: the matrix component drives Vue
 * reactivity; the partition rule is a pure function and the vitest
 * unit drives it directly without a Nuxt harness.
 *
 * Decision (ADR-0033 §visibility): a view with `userId === null` is
 * an org-shared view; everything else is the requesting user's own
 * row. Other users' private rows never reach the client because the
 * service filters them out, but we double-check here for defense-
 * in-depth (UI never trusts a list it didn't filter itself).
 */
import type { SavedView } from '~~/shared/contracts/saved-view'

export interface PartitionedSavedViews {
  mine: SavedView[]
  shared: SavedView[]
}

export function partitionSavedViews(
  rows: readonly SavedView[],
  currentUserId: string,
): PartitionedSavedViews {
  const mine: SavedView[] = []
  const shared: SavedView[] = []
  for (const v of rows) {
    if (v.userId === null) shared.push(v)
    else if (v.userId === currentUserId) mine.push(v)
    // else: drop (shouldn't happen — service is supposed to filter).
  }
  return { mine, shared }
}
