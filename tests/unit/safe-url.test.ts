/**
 * tests/unit/safe-url.test.ts — covers `app/utils/safeUrl.ts`
 * (W5-3 / ADR-0037).
 */
import { describe, it, expect } from 'vitest'
import { safeUrl } from '~~/app/utils/safeUrl'

describe('safeUrl', () => {
  it('passes through http / https URLs', () => {
    expect(safeUrl('http://example.com/x.png')).toBe('http://example.com/x.png')
    expect(safeUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png')
  })

  it('passes through mailto and tel', () => {
    expect(safeUrl('mailto:foo@example.com')).toBe('mailto:foo@example.com')
    expect(safeUrl('tel:+15555550100')).toBe('tel:+15555550100')
  })

  it('passes through relative paths and fragments', () => {
    expect(safeUrl('/admin/properties/abc')).toBe('/admin/properties/abc')
    expect(safeUrl('?q=foo')).toBe('?q=foo')
    expect(safeUrl('#section')).toBe('#section')
    expect(safeUrl('foo/bar.png')).toBe('foo/bar.png')
  })

  it('rejects javascript: scheme', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBeNull()
    expect(safeUrl('Java\tScript:alert(1)')).toBeNull()
    expect(safeUrl(' javascript:alert(1)')).toBeNull()
    expect(safeUrl('\njavascript:alert(1)')).toBeNull()
  })

  it('rejects data: and other unknown schemes', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull()
    expect(safeUrl('file:///etc/passwd')).toBeNull()
    expect(safeUrl('ftp://example.com/x')).toBeNull()
  })

  it('handles null / empty / whitespace', () => {
    expect(safeUrl(null)).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
    expect(safeUrl('')).toBeNull()
    expect(safeUrl('   ')).toBeNull()
  })
})
