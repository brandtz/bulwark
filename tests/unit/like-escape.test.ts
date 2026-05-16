/**
 * tests/unit/like-escape.test.ts — covers `shared/utils/likeEscape.ts`
 * (W5-3 / ADR-0037).
 */
import { describe, it, expect } from 'vitest'
import { escapeLike, escapeLikeContains } from '~~/shared/utils/likeEscape'

describe('escapeLike', () => {
  it('escapes %, _, and \\', () => {
    expect(escapeLike('100% off')).toBe('100\\% off')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('back\\slash')).toBe('back\\\\slash')
  })

  it('leaves ordinary text unchanged', () => {
    expect(escapeLike('Smith')).toBe('Smith')
    expect(escapeLike('foo@example.com')).toBe('foo@example.com')
  })

  it('escapes backslash before wildcards to avoid double-escaping', () => {
    // `\%` (literal backslash + percent) escaped should become `\\\%`:
    // `\\` (literal backslash) + `\%` (literal percent).
    expect(escapeLike('\\%')).toBe('\\\\\\%')
  })
})

describe('escapeLikeContains', () => {
  it('wraps the escaped value with leading + trailing %', () => {
    expect(escapeLikeContains('foo')).toBe('%foo%')
    expect(escapeLikeContains('100%')).toBe('%100\\%%')
    expect(escapeLikeContains('a_b')).toBe('%a\\_b%')
  })
})
