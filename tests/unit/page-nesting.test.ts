/**
 * Nuxt file routing: `pages/x.vue` next to a `pages/x/` folder makes x.vue the
 * PARENT route of everything in x/. Without a <NuxtPage/> in x.vue the child
 * pages never render: the URL changes and the parent stays on screen. This hid
 * /profile/security (fixed in WP-L07) and the homeowner quote and invoice
 * detail pages (fixed in the 2026-09-29 release pass, whose specs had been
 * skipped as "not shipped"). Put the list page at x/index.vue instead.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PAGES = path.resolve(__dirname, '../../app/pages')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

describe('page nesting', () => {
  it('no page shadows a same-named folder of child pages without rendering <NuxtPage />', () => {
    const shadowing = walk(PAGES)
      .filter((f) => f.endsWith('.vue'))
      .filter((f) => {
        const folder = f.slice(0, -'.vue'.length)
        return existsSync(folder) && statSync(folder).isDirectory() && !/<NuxtPage\b/u.test(readFileSync(f, 'utf8'))
      })
      .map((f) => path.relative(PAGES, f).replace(/\\/gu, '/'))
    expect(shadowing, `move each to <name>/index.vue: ${shadowing.join(', ')}`).toEqual([])
  })
})
