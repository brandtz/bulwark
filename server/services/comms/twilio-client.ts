/**
 * server/services/comms/twilio-client.ts — Twilio Messages API client (WP-L03).
 *
 * Pinned to Twilio's 2010-04-01 REST API. Twilio has no idempotency key
 * for message creation, so only responses that guarantee nothing was
 * queued (429 rate limit, 503 unavailable) are retried; a 500 or a lost
 * response might already have sent the SMS and is reported, not retried.
 */
import { callProvider, type ProviderResponse } from './provider-http'

export const TWILIO_API_VERSION = '2010-04-01'

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/${TWILIO_API_VERSION}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
}

export interface TwilioMessage {
  accountSid: string
  authToken: string
  from: string
  to: string
  body: string
}

export async function sendViaTwilio(
  message: TwilioMessage,
  opts: { baseDelayMs?: number, timeoutMs?: number } = {},
): Promise<ProviderResponse & { id?: string }> {
  const auth = Buffer.from(`${message.accountSid}:${message.authToken}`).toString('base64')
  const result = await callProvider({
    url: twilioMessagesUrl(message.accountSid),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: new URLSearchParams({ To: message.to, From: message.from, Body: message.body }).toString(),
    },
    retryOn: (status) => status === 429 || status === 503,
    retryNetworkErrors: false,
    ...opts,
  })
  if (!result.ok) return result
  const sid = (result.body as { sid?: unknown }).sid
  return typeof sid === 'string' ? { ...result, id: sid } : result
}
