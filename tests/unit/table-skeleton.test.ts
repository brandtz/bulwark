/**
 * tests/unit/table-skeleton.test.ts — BulwarkTableSkeleton SFC contract (W2-6).
 *
 * # Why this test exists
 * See signature-pad.test.ts header — Vitest is node-only, so we lint
 * the SFC source to confirm it renders the correct row/col grid.
 *
 * # What we guarantee
 *   - File exists at the canonical path.
 *   - Default rows=5, cols=4, showHeader=true (matches W2-6 spec).
 *   - Template `v-for` over `props.rows` and (inside the row) `props.cols`.
 *   - Uses `animate-pulse` + `bg-slate-200` per spec.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SFC_PATH = fileURLToPath(
  new URL('../../app/components/ui/BulwarkTableSkeleton.vue', import.meta.url),
)
const SRC = readFileSync(SFC_PATH, 'utf8')

describe('BulwarkTableSkeleton SFC contract', () => {
  it('declares rows, cols, showHeader props', () => {
    expect(SRC).toMatch(/rows\??:\s*number/)
    expect(SRC).toMatch(/cols\??:\s*number/)
    expect(SRC).toMatch(/showHeader\??:\s*boolean/)
  })

  it('defaults to 5 rows, 4 cols, showHeader=true', () => {
    expect(SRC).toMatch(/rows:\s*5/)
    expect(SRC).toMatch(/cols:\s*4/)
    expect(SRC).toMatch(/showHeader:\s*true/)
  })

  it('renders v-for over rows AND v-for over cols inside each row', () => {
    // Outer row loop
    expect(SRC).toMatch(/v-for="r in props\.rows"/)
    // Inner cell loop
    expect(SRC).toMatch(/v-for="c in props\.cols"/)
  })

  it('uses the shimmer tokens from the spec', () => {
    expect(SRC).toContain('animate-pulse')
    expect(SRC).toContain('bg-slate-200')
  })

  it('emits aria-busy=true for assistive tech', () => {
    expect(SRC).toMatch(/:aria-busy=\s*"true"/)
    expect(SRC).toMatch(/aria-live=/)
  })
})
