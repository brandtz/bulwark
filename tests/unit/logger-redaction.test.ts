/**
 * tests/unit/logger-redaction.test.ts — W5-2 / ADR-0036 redaction matrix.
 *
 * # What this file does
 *   Exercises the expanded `redactFields()` deny list (auth credentials
 *   + PII patterns + `_encrypted` suffix defense) and the recursive
 *   walk added for W5-2. The base level-filter / shape assertions live
 *   in `tests/unit/logger.test.ts` — this file is the security
 *   regression net for the redaction patterns specifically.
 *
 * # Decisions (ADR-0008, ADR-0036)
 *   - One test per family (auth, PII, encrypted-suffix, nested,
 *     arrays, circular). Keeps failure messages legible.
 *   - We assert on the *redacted* representation only — never on the
 *     raw input — so a future redaction-list expansion can't quietly
 *     remove coverage.
 */
import { describe, it, expect } from 'vitest'
import { redactFields } from '~~/server/utils/logger'

describe('logger redaction — W5-2', () => {
  it('redacts the full auth-credential family', () => {
    const out = redactFields({
      password: 'hunter2',
      Password: 'hunter2',
      token: 'tok',
      secret: 's',
      apiKey: 'ak',
      api_key: 'ak2',
      authorization: 'Bearer xyz',
      Authorization: 'Bearer xyz',
      cookie: 'c',
      'set-cookie': 'sc',
      accessToken: 'at',
      access_token: 'at2',
      refreshToken: 'rt',
      refresh_token: 'rt2',
      clientSecret: 'cs',
      client_secret: 'cs2',
      authToken: 'authTok',
      auth_token: 'authTok2',
    })
    for (const v of Object.values(out)) expect(v).toBe('[REDACTED]')
  })

  it('redacts PII patterns (ssn / dob / cards / banking / tax)', () => {
    const out = redactFields({
      ssn: '123-45-6789',
      dob: '1990-01-01',
      dateOfBirth: '1990-01-01',
      date_of_birth: '1990-01-01',
      creditCard: '4111111111111111',
      credit_card: '4111-1111-1111-1111',
      cardNumber: '4111111111111111',
      card_number: '4111111111111111',
      cvv: '123',
      cvc: '123',
      bankAccount: '00012345',
      bank_account: '00012345',
      routingNumber: '021000021',
      routing_number: '021000021',
      taxId: '11-2233445',
      tax_id: '11-2233445',
      ein: '11-2233445',
      driverLicense: 'D1234567',
      driver_license: 'D1234567',
      driversLicense: 'D1234567',
      drivers_license: 'D1234567',
    })
    for (const v of Object.values(out)) expect(v).toBe('[REDACTED]')
  })

  it('redacts any key suffixed with _encrypted (defense in depth)', () => {
    const out = redactFields({
      config_encrypted: 'base64envelope==',
      secret_encrypted: 'base64envelope==',
      payloadEncrypted: 'base64envelope==',
      MFA_SECRET_ENCRYPTED: 'base64envelope==',
    })
    expect(out.config_encrypted).toBe('[REDACTED]')
    expect(out.secret_encrypted).toBe('[REDACTED]')
    expect(out.payloadEncrypted).toBe('[REDACTED]')
    expect(out.MFA_SECRET_ENCRYPTED).toBe('[REDACTED]')
  })

  it('leaves non-sensitive keys alone', () => {
    const out = redactFields({
      email: 'admin@example.com',
      method: 'POST',
      status: 200,
      organizationId: 'org-uuid',
    })
    expect(out.email).toBe('admin@example.com')
    expect(out.method).toBe('POST')
    expect(out.status).toBe(200)
    expect(out.organizationId).toBe('org-uuid')
  })

  it('walks nested objects recursively', () => {
    const out = redactFields({
      request: {
        method: 'POST',
        headers: { authorization: 'Bearer xyz', 'x-trace': 'abc' },
      },
      provider: { config: { apiKey: 'ak', from: 'a@b.com' } },
    })
    const req = out.request as Record<string, unknown>
    const headers = req.headers as Record<string, unknown>
    expect(headers.authorization).toBe('[REDACTED]')
    expect(headers['x-trace']).toBe('abc')
    const prov = out.provider as Record<string, unknown>
    const cfg = prov.config as Record<string, unknown>
    expect(cfg.apiKey).toBe('[REDACTED]')
    expect(cfg.from).toBe('a@b.com')
  })

  it('walks arrays and array-of-object payloads', () => {
    const out = redactFields({
      hits: [
        { id: 1, token: 't' },
        { id: 2, password: 'p' },
      ],
    })
    const hits = out.hits as Array<Record<string, unknown>>
    expect(hits[0]!.id).toBe(1)
    expect(hits[0]!.token).toBe('[REDACTED]')
    expect(hits[1]!.password).toBe('[REDACTED]')
  })

  it('short-circuits circular references without throwing', () => {
    type Node = { name: string; self?: unknown; password: string }
    const cyc: Node = { name: 'root', password: 'p' }
    cyc.self = cyc
    const out = redactFields({ node: cyc })
    const node = out.node as Record<string, unknown>
    expect(node.password).toBe('[REDACTED]')
    expect(node.self).toBe('[CIRCULAR]')
  })
})
