/**
 * tests/unit/permissions-matrix.test.ts — pure helpers behind the
 * settings/permissions tri-state grid (W4-1 / EH-L).
 */
import { describe, it, expect } from 'vitest'
import {
  cycleCellState,
  deriveCellState,
} from '../../app/composables/permissions-matrix-helpers'

describe('cycleCellState', () => {
  it('cycles default → granted → denied → default', () => {
    expect(cycleCellState('default')).toBe('granted')
    expect(cycleCellState('granted')).toBe('denied')
    expect(cycleCellState('denied')).toBe('default')
  })
})

describe('deriveCellState', () => {
  it('returns default for undefined', () => {
    expect(deriveCellState(undefined)).toBe('default')
  })
  it('returns granted for true', () => {
    expect(deriveCellState(true)).toBe('granted')
  })
  it('returns denied for false', () => {
    expect(deriveCellState(false)).toBe('denied')
  })
})
