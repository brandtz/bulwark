/**
 * tests/unit/fixture-ids.test.ts — mock fixture ids are unique.
 *
 * mk() derives ids from slugs and pads with zeros, so two slugs can collide
 * ('property-1' vs 'property-10' once did: the AD-10 board rendered one
 * property twice on the mock lane).
 */
import { describe, expect, it } from 'vitest'
import * as F from '../../shared/mocks/fixtures'

describe('mock fixtures', () => {
  it('every fixture list has unique ids', () => {
    for (const [name, value] of Object.entries(F)) {
      if (!Array.isArray(value) || !value.every((r) => r && typeof r === 'object' && 'id' in r)) continue
      const ids = (value as Array<{ id: string }>).map((r) => r.id)
      expect(new Set(ids).size, `${name} has duplicate ids`).toBe(ids.length)
    }
  })
})
