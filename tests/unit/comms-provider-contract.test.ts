/**
 * WP-L03 / gap register 3.2.4 — provider contract tests. Pins the Resend and
 * Twilio request shapes and the bounded retry policy against a stubbed fetch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESEND_EMAILS_URL, sendViaResend } from '../../server/services/comms/resend-client'
import { sendViaTwilio, twilioMessagesUrl } from '../../server/services/comms/twilio-client'

const fast = { baseDelayMs: 0 }

function stubFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string, init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra provider call')
    if (next instanceof Error) throw next
    return next
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

const resendMessage = {
  apiKey: 're_test',
  from: 'Bulwark <no-reply@example.test>',
  to: 'owner@example.test',
  subject: 'Invite',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'key-1',
}
const twilioMessage = { accountSid: 'AC123', authToken: 'tok', from: '+15550000000', to: '+15551111111', body: 'Hi' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Resend client contract', () => {
  it('posts the pinned JSON payload with bearer auth and an idempotency key', async () => {
    const calls = stubFetch(json(200, { id: 'em_1' }))
    const result = await sendViaResend(resendMessage, fast)
    expect(result).toMatchObject({ ok: true, id: 'em_1', attempts: 1 })
    expect(calls[0]!.url).toBe(RESEND_EMAILS_URL)
    expect(calls[0]!.url).toBe('https://api.resend.com/emails')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_test')
    expect(headers['Idempotency-Key']).toBe('key-1')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: resendMessage.from, to: resendMessage.to, subject: 'Invite', html: '<p>Hi</p>', text: 'Hi',
    })
  })

  it('retries 5xx and network errors with the same idempotency key, then succeeds', async () => {
    const calls = stubFetch(json(503, {}), new TypeError('fetch failed'), json(200, { id: 'em_2' }))
    const result = await sendViaResend(resendMessage, fast)
    expect(result).toMatchObject({ ok: true, id: 'em_2', attempts: 3 })
    expect(calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key'])).toEqual(['key-1', 'key-1', 'key-1'])
  })

  it('stops after three attempts and reports the last failure', async () => {
    stubFetch(json(500, {}), json(502, {}), json(429, {}))
    const result = await sendViaResend(resendMessage, fast)
    expect(result).toEqual({ ok: false, status: 429, error: 'HTTP 429', attempts: 3 })
  })

  it('does not retry a 4xx validation error', async () => {
    const calls = stubFetch(json(422, { message: 'invalid from' }))
    const result = await sendViaResend(resendMessage, fast)
    expect(result).toMatchObject({ ok: false, status: 422, attempts: 1 })
    expect(calls).toHaveLength(1)
  })

  it('times out a hung provider instead of waiting forever', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })))
    const result = await sendViaResend(resendMessage, { baseDelayMs: 0, timeoutMs: 20 })
    expect(result).toMatchObject({ ok: false, status: null, error: 'timed out after 20ms', attempts: 3 })
  })
})

describe('Twilio client contract', () => {
  it('posts form-encoded fields to the pinned 2010-04-01 Messages endpoint', async () => {
    const calls = stubFetch(json(201, { sid: 'SM1' }))
    const result = await sendViaTwilio(twilioMessage, fast)
    expect(result).toMatchObject({ ok: true, id: 'SM1', attempts: 1 })
    expect(calls[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('AC123:tok').toString('base64')}`)
    expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))).toEqual({
      To: '+15551111111', From: '+15550000000', Body: 'Hi',
    })
  })

  it('encodes the account SID into the path', () => {
    expect(twilioMessagesUrl('AC/../x')).toBe('https://api.twilio.com/2010-04-01/Accounts/AC%2F..%2Fx/Messages.json')
  })

  it('retries 429 but never a 500 or lost response that may already have sent', async () => {
    const retried = stubFetch(json(429, {}), json(201, { sid: 'SM2' }))
    expect(await sendViaTwilio(twilioMessage, fast)).toMatchObject({ ok: true, attempts: 2 })
    expect(retried).toHaveLength(2)

    const serverError = stubFetch(json(500, {}))
    expect(await sendViaTwilio(twilioMessage, fast)).toMatchObject({ ok: false, status: 500, attempts: 1 })
    expect(serverError).toHaveLength(1)

    const lost = stubFetch(new TypeError('socket hang up'))
    expect(await sendViaTwilio(twilioMessage, fast)).toMatchObject({ ok: false, error: 'network error', attempts: 1 })
    expect(lost).toHaveLength(1)
  })
})
