/**
 * tests/unit/status-hue.test.ts — WP-X5 status hues.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PIPELINES } from '~~/shared/pipelines/defaults'
import { defaultHue, hueOnSave, nearestHue, SLUG_DEFAULT_HUE, STATUS_HUES } from '~~/shared/utils/status-hue'

describe('status hues (WP-X5)', () => {
  it('maps colours to the nearest design hue', () => {
    expect(nearestHue('#2563EB')).toBe('blue')
    expect(nearestHue('#0EA5E9')).toBe('blue') // legacy "scheduled" sky
    expect(nearestHue('#22C55E')).toBe('green')
    expect(nearestHue('#EF4444')).toBe('red')
    expect(nearestHue('#F59E0B')).toBe('amber')
    expect(nearestHue('#7C3AED')).toBe('violet')
    expect(nearestHue('#abc')).toBe(nearestHue('#aabbcc')) // 3-digit hex expands
    expect(nearestHue('not-a-colour')).toBe('gray')
  })

  it('gives every built-in status of every default pipeline a design hue', () => {
    for (const [entity, pipeline] of Object.entries(DEFAULT_PIPELINES)) {
      for (const n of pipeline.nodes) {
        expect(SLUG_DEFAULT_HUE[n.slug], `${entity}.${n.slug}`).toBeDefined()
        expect(STATUS_HUES).toContain(defaultHue(n.slug, n.color))
      }
    }
    // The Packet B defaults the property pipeline renders with.
    expect(defaultHue('accepted', '#22C55E')).toBe('teal') // slug default, not the nearest (green)
    expect(defaultHue('in_progress', '#F59E0B')).toBe('amber')
  })

  it('keeps a node\'s hue on a colour-only save unless the colour changed', () => {
    const prev = { color: '#22C55E', hue: 'teal' as const }
    expect(hueOnSave({ slug: 'accepted', color: '#22C55E' }, prev)).toBe('teal')
    expect(hueOnSave({ slug: 'accepted', color: '#22c55e' }, prev)).toBe('teal') // case-insensitive
    expect(hueOnSave({ slug: 'accepted', color: '#EF4444' }, prev)).toBe('red')
    expect(hueOnSave({ slug: 'accepted', color: '#EF4444', hue: 'pink' }, prev)).toBe('pink')
    expect(hueOnSave({ slug: 'custom_review', color: '#DB2777' })).toBe('pink')
    expect(hueOnSave({ slug: 'lead', color: '#000000' })).toBe('slate') // new built-in slug: design default
  })

  it('the seed script uses the same slug hues', () => {
    const seed = readFileSync(path.resolve(__dirname, '../../scripts/db-seed.mjs'), 'utf8')
    const block = seed.match(/const SEED_STATUS_HUE = \{([\s\S]*?)\n {2}\}/u)?.[1] ?? ''
    const pairs = Object.fromEntries([...block.matchAll(/(\w+): '(\w+)'/gu)].map((m) => [m[1], m[2]]))
    expect(pairs).toEqual(SLUG_DEFAULT_HUE)
  })
})
