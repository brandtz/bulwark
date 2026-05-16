/**
 * tests/unit/signature-pad.test.ts — BulwarkSignaturePad SFC contract (W2-6).
 *
 * # Why this test exists
 * Vitest runs in `node` env without `@vitejs/plugin-vue` (see
 * vitest.config.ts) so we can't mount the SFC. We assert the file's
 * surface area instead — props, exposed imperative API, emitted
 * events, and PNG capture path — by reading the SFC source and
 * regex-matching the canonical shape.
 *
 * # What we guarantee
 *   - The component file exists at the canonical path.
 *   - It declares the W2-6 props (`modelValue`, `disabled`, `placeholder`).
 *   - It exposes `clear` and `save` via `defineExpose`.
 *   - `clear()` emits an empty `update:modelValue` (resets the buffer).
 *   - `save()` emits the canvas `toDataURL('image/png')` result.
 *   - a11y baseline: `aria-label="Signature canvas"`.
 *
 * # Decisions NOT taken
 *   - We do NOT mount the SFC with `@vue/test-utils` — that would
 *     require adding `happy-dom` + `@vue/test-utils` as devDeps. The
 *     prompt forbids new deps. End-to-end mounting is covered by the
 *     existing compliance-generator + inspection-dynamic e2e specs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SFC_PATH = fileURLToPath(
  new URL('../../app/components/ui/BulwarkSignaturePad.vue', import.meta.url),
)
const SRC = readFileSync(SFC_PATH, 'utf8')

describe('BulwarkSignaturePad SFC contract', () => {
  it('declares the W2-6 prop interface', () => {
    expect(SRC).toMatch(/modelValue:\s*string/)
    expect(SRC).toMatch(/disabled\??:\s*boolean/)
    expect(SRC).toMatch(/placeholder\??:\s*string/)
    expect(SRC).toMatch(/placeholder:\s*['"]Sign here['"]/)
  })

  it('exposes the imperative clear + save API', () => {
    expect(SRC).toMatch(/defineExpose\(\s*\{\s*clear\s*,\s*save\s*\}\s*\)/)
  })

  it('clear() resets the buffer by emitting an empty modelValue', () => {
    // The clear() function body must call emit('update:modelValue', '').
    const clearFn = SRC.match(/function clear\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(clearFn).toContain("emit('update:modelValue', '')")
    expect(clearFn).toMatch(/clearRect/)
  })

  it("save() emits a data:image/png string via canvas.toDataURL", () => {
    const saveFn = SRC.match(/function save\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(saveFn).toMatch(/toDataURL\(\s*['"]image\/png['"]\s*\)/)
    expect(saveFn).toContain("emit('update:modelValue'")
  })

  it('has the accessible aria-label "Signature canvas"', () => {
    expect(SRC).toContain('aria-label="Signature canvas"')
    expect(SRC).toContain('role="img"')
    expect(SRC).toContain('tabindex="0"')
  })

  it('uses native canvas + pointer events (no signature_pad dep)', () => {
    expect(SRC).toMatch(/<canvas\b/)
    expect(SRC).toMatch(/@pointerdown=/)
    expect(SRC).toMatch(/@pointerup=/)
    expect(SRC).not.toMatch(/from\s+['"]signature_pad['"]/)
  })
})
