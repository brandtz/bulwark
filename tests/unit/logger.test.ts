/**
 * tests/unit/logger.test.ts — verify level filtering, JSON shape, redaction
 * (W3-5 / EH-Q / ADR-0034).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildLogEvent, redactFields } from '~~/server/utils/logger'

describe('logger', () => {
  const original = process.env.BULWARK_LOG_LEVEL
  beforeEach(() => {
    delete process.env.BULWARK_LOG_LEVEL
  })
  afterEach(() => {
    process.env.BULWARK_LOG_LEVEL = original
  })

  it('emits debug only when BULWARK_LOG_LEVEL=debug', () => {
    process.env.BULWARK_LOG_LEVEL = 'info'
    expect(buildLogEvent('debug', 'x')).toBeNull()
    process.env.BULWARK_LOG_LEVEL = 'debug'
    expect(buildLogEvent('debug', 'x')).not.toBeNull()
  })

  it('always emits info at the default level', () => {
    const evt = buildLogEvent('info', 'request.start', { method: 'GET' })
    expect(evt).not.toBeNull()
    expect(evt!.level).toBe('info')
    expect(evt!.message).toBe('request.start')
    expect(evt!.method).toBe('GET')
    expect(typeof evt!.ts).toBe('string')
  })

  it('redacts sensitive keys', () => {
    const out = redactFields({
      password: 'hunter2',
      token: 'abc',
      apiKey: 'xyz',
      Authorization: 'Bearer ...',
      safe: 'ok',
    })
    expect(out.password).toBe('[REDACTED]')
    expect(out.token).toBe('[REDACTED]')
    expect(out.apiKey).toBe('[REDACTED]')
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out.safe).toBe('ok')
  })

  it('routes errors above warnings above info', () => {
    process.env.BULWARK_LOG_LEVEL = 'warn'
    expect(buildLogEvent('info', 'x')).toBeNull()
    expect(buildLogEvent('warn', 'x')).not.toBeNull()
    expect(buildLogEvent('error', 'x')).not.toBeNull()
  })
})
