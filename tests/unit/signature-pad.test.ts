/**
 * tests/unit/signature-pad.test.ts — BulwarkSignaturePad SFC contract.
 *
 * Vitest runs in node without the Vue plugin, so this asserts the SFC's
 * surface from source; behaviour is covered end to end (compliance generator,
 * inspection sign-off, /dev/ui). Contract per Packet A components/SPEC.md
 * (WP-A2, which absorbed the duplicate compliance/SignaturePad):
 *   - v-model carries the PNG data URL; each finished stroke commits it.
 *   - v-model:is-empty reflects whether anything is drawn.
 *   - `locked` freezes it (SPEC), `disabled` still works.
 *   - clear() empties the canvas and emits '' plus `clear`.
 *   - The canvas is role=img with an accessible name that says empty/signed.
 *   - Native canvas + pointer events, no third-party signature dependency.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = readFileSync(fileURLToPath(new URL('../../app/components/ui/BulwarkSignaturePad.vue', import.meta.url)), 'utf8')

describe('BulwarkSignaturePad SFC contract (WP-A2)', () => {
  it('declares the SPEC props and keeps the existing ones', () => {
    expect(SRC).toMatch(/modelValue:\s*string/)
    expect(SRC).toMatch(/locked\??:\s*boolean/)
    expect(SRC).toMatch(/disabled\??:\s*boolean/)
    expect(SRC).toMatch(/height:\s*140/)
    expect(SRC).toMatch(/placeholder:\s*['"]Sign here['"]/)
  })

  it('commits the PNG on every finished stroke and reports emptiness', () => {
    const commit = SRC.match(/function commit\([^)]*\)\s*\{[\s\S]*?\n\}/u)?.[0] ?? ''
    expect(commit).toMatch(/toDataURL\(\s*['"]image\/png['"]\s*\)/u)
    expect(commit).toContain("emit('update:modelValue'")
    expect(commit).toContain("emit('update:isEmpty', false)")
    const up = SRC.match(/function onPointerUp\([^)]*\)\s*\{[\s\S]*?\n\}/u)?.[0] ?? ''
    expect(up).toContain('commit()')
  })

  it('clear() empties the canvas and emits an empty value and `clear`', () => {
    const clearFn = SRC.match(/function clear\([^)]*\)\s*\{[\s\S]*?\n\}/u)?.[0] ?? ''
    expect(clearFn).toMatch(/clearRect/u)
    expect(clearFn).toContain("emit('update:modelValue', '')")
    expect(clearFn).toContain("emit('clear')")
    expect(SRC).toMatch(/defineExpose\(\s*\{\s*clear\s*\}\s*\)/u)
  })

  it('a locked pad ignores drawing and hides Clear', () => {
    const down = SRC.match(/function onPointerDown\([^)]*\)\s*\{[\s\S]*?\n\}/u)?.[0] ?? ''
    expect(down).toMatch(/if \(frozen\.value\) return/u)
    expect(SRC).toMatch(/v-if="!locked"[\s\S]*?data-testid="signature-pad-clear"/u)
  })

  it('the canvas is an image with an accessible, state-aware name', () => {
    expect(SRC).toContain('role="img"')
    expect(SRC).toMatch(/:aria-label="isEmpty \? `\$\{label\}: empty` : `\$\{label\}: signed`"/u)
  })

  it('uses native canvas + pointer events (no signature_pad dependency)', () => {
    expect(SRC).toMatch(/<canvas\b/u)
    expect(SRC).toMatch(/@pointerdown=/u)
    expect(SRC).toMatch(/@pointerup=/u)
    expect(SRC).not.toMatch(/from\s+['"]signature_pad['"]/u)
  })
})
