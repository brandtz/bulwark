/**
 * tests/unit/security-headers.test.ts — header builder for the
 * 02.security-headers middleware (W5-1 / EH-R / ADR-0035).
 */
import { describe, it, expect } from 'vitest'
import {
  buildSecurityHeaders,
  buildCspValue,
  CSP_DIRECTIVES,
} from '~~/server/utils/security-headers'

describe('buildSecurityHeaders — always-on baseline', () => {
  const baseline = buildSecurityHeaders({ isHtml: false, env: {} })
  it('sets X-Frame-Options DENY', () => {
    expect(baseline['X-Frame-Options']).toBe('DENY')
  })
  it('sets X-Content-Type-Options nosniff', () => {
    expect(baseline['X-Content-Type-Options']).toBe('nosniff')
  })
  it('sets a strict-origin Referrer-Policy', () => {
    expect(baseline['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
  it('locks Permissions-Policy down except geolocation=self', () => {
    expect(baseline['Permissions-Policy']).toContain('camera=()')
    expect(baseline['Permissions-Policy']).toContain('microphone=()')
    expect(baseline['Permissions-Policy']).toContain('geolocation=(self)')
    expect(baseline['Permissions-Policy']).toContain('interest-cohort=()')
  })
  it('disables DNS prefetch', () => {
    expect(baseline['X-DNS-Prefetch-Control']).toBe('off')
  })
})

describe('buildSecurityHeaders — HSTS gating', () => {
  it('omits HSTS in development', () => {
    const h = buildSecurityHeaders({ isHtml: true, env: { nodeEnv: 'development' } })
    expect(h['Strict-Transport-Security']).toBeUndefined()
  })

  it('emits HSTS in production', () => {
    const h = buildSecurityHeaders({ isHtml: true, env: { nodeEnv: 'production' } })
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/)
    expect(h['Strict-Transport-Security']).toContain('includeSubDomains')
    expect(h['Strict-Transport-Security']).toContain('preload')
  })

  it('emits HSTS when BULWARK_FORCE_HSTS=1 in any env', () => {
    const h = buildSecurityHeaders({ isHtml: true, env: { nodeEnv: 'development', forceHsts: '1' } })
    expect(h['Strict-Transport-Security']).toMatch(/max-age=/)
  })
})

describe('buildSecurityHeaders — CSP gating', () => {
  it('emits CSP for HTML responses', () => {
    const h = buildSecurityHeaders({ isHtml: true, env: {} })
    expect(h['Content-Security-Policy']).toBeDefined()
    expect(h['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('omits CSP for JSON / API responses', () => {
    const h = buildSecurityHeaders({ isHtml: false, env: {} })
    expect(h['Content-Security-Policy']).toBeUndefined()
    expect(h['Content-Security-Policy-Report-Only']).toBeUndefined()
  })

  it('flips header name when BULWARK_CSP_REPORT_ONLY=1', () => {
    const h = buildSecurityHeaders({ isHtml: true, env: { cspReportOnly: '1' } })
    expect(h['Content-Security-Policy']).toBeUndefined()
    expect(h['Content-Security-Policy-Report-Only']).toBeDefined()
  })

  it('includes the documented baseline directives', () => {
    const csp = buildCspValue()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('img-src')
    expect(csp).toMatch(/img-src[^;]*data:/)
    expect(csp).toMatch(/img-src[^;]*blob:/)
  })

  it('CSP_DIRECTIVES is a stable ordered list', () => {
    expect(CSP_DIRECTIVES.length).toBeGreaterThan(5)
    expect(CSP_DIRECTIVES[0]?.[0]).toBe('default-src')
  })
})
