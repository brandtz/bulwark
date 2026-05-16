/**
 * tests/unit/use-label.test.ts — resolution priority for the CMS label
 * composable (EH-B / W1-2 / ADR-0014).
 *
 * Why this test exists:
 *   - `useLabel().t()` is a thin wrapper around `resolveLabel()` which
 *     encodes the override → default → fallback priority rule. This is
 *     the *invariant* every consumer relies on; if it flips, every
 *     status badge and trade chip in the app reads the wrong copy.
 *   - The composable itself depends on Nuxt's `useState`/`useService`
 *     runtime, which Vitest (node env) doesn't boot. We intentionally
 *     extracted the pure resolver so we can lock its behavior here
 *     without the Nuxt harness.
 */
import { describe, it, expect } from 'vitest'
import { resolveLabel } from '../../app/composables/useLabel'
import { DEFAULT_LABELS } from '~~/shared/labels/defaults'

describe('resolveLabel', () => {
  it('returns the override when present', () => {
    const overrides = { 'status.property.lead': 'Prospect' }
    expect(resolveLabel(overrides, 'status.property', 'lead', 'Lead')).toBe('Prospect')
  })

  it('falls back to DEFAULT_LABELS when no override exists', () => {
    expect(resolveLabel({}, 'status.property', 'lead', 'IGNORED')).toBe(
      DEFAULT_LABELS['status.property.lead'],
    )
  })

  it('falls back to the caller-supplied default for unknown keys', () => {
    expect(resolveLabel({}, 'totally', 'made_up', 'Hello')).toBe('Hello')
  })

  it('ignores an empty-string override and falls through', () => {
    // Empty overrides are treated as absent per the falsy guard in
    // resolveLabel — admins can "reset" by clearing the value if their
    // editor flow allowed empty saves (the editor blocks empty on save,
    // but defense in depth).
    const overrides = { 'status.property.lead': '' }
    expect(resolveLabel(overrides, 'status.property', 'lead', 'Lead')).toBe(
      DEFAULT_LABELS['status.property.lead'],
    )
  })

  it('is org-scoped at the caller: different override maps yield different results', () => {
    const orgA = { 'trade.roofing': 'Roofs by A' }
    const orgB = { 'trade.roofing': 'Roof Co B' }
    expect(resolveLabel(orgA, 'trade', 'roofing', 'Roofing')).toBe('Roofs by A')
    expect(resolveLabel(orgB, 'trade', 'roofing', 'Roofing')).toBe('Roof Co B')
  })
})
