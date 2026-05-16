/**
 * tests/unit/bulwark-icon.test.ts — sprite/name registry contract.
 *
 * Why this test exists
 * --------------------
 * `BulwarkIcon` exposes `ICON_NAMES`, a string union shared with every
 * consume site. If a glyph is referenced from a template but missing
 * from public/icons/sprite.svg, the browser silently renders a broken
 * 0×0 box — a visual bug that's easy to miss in PR review. We catch
 * the typo here.
 *
 * Scope
 * -----
 * - For each name advertised by the component, the sprite must contain
 *   a `<symbol id="bw-{name}">`.
 * - The sprite is read off disk so the test catches drift in either
 *   direction (rename in component, rename in sprite).
 *
 * Decisions NOT taken
 * -------------------
 * - We do NOT mount the Vue component. The Vitest env is `node`
 *   (ADR-0007); component DOM is exercised end-to-end by Playwright.
 *   A regex sweep covers the only invariant that matters for runtime
 *   correctness — the symbol IDs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// We import from icon-names.ts (not BulwarkIcon.vue) because Vitest's
// node env doesn't load @vitejs/plugin-vue. The component re-exports
// the same array; the registry is the source of truth.
import { ICON_NAMES } from '../../app/components/ui/icon-names'

const SPRITE_PATH = fileURLToPath(new URL('../../public/icons/sprite.svg', import.meta.url))
const SPRITE = readFileSync(SPRITE_PATH, 'utf8')

describe('BulwarkIcon sprite contract', () => {
  it('exposes a non-empty, unique ICON_NAMES list', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(30)
    const unique = new Set(ICON_NAMES)
    expect(unique.size).toBe(ICON_NAMES.length)
  })

  it('every advertised glyph has a matching <symbol id="bw-{name}"> in the sprite', () => {
    const missing: string[] = []
    for (const name of ICON_NAMES) {
      const needle = `id="bw-${name}"`
      if (!SPRITE.includes(needle)) missing.push(name)
    }
    expect(missing).toEqual([])
  })

  it('the sprite is served from /public so the SVG <use href="/icons/sprite.svg#…"> reference resolves', () => {
    // If this assertion fails the sprite has been moved back into
    // app/assets/ where Nuxt would not serve it directly — fix by
    // moving it to public/icons/sprite.svg (see ADR-0026).
    expect(SPRITE.includes('<svg')).toBe(true)
  })
})
