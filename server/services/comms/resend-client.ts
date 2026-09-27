/**
 * server/services/comms/resend-client.ts — Resend emails API client (WP-L03).
 *
 * Resend's REST API is unversioned; we pin the endpoint and payload shape
 * here and cover them with tests/unit/comms-provider-contract.test.ts so a
 * drift shows up as a test change. An Idempotency-Key makes retries on
 * 429/5xx/network errors safe: Resend deduplicates within 24 hours.
 */
import { callProvider, type ProviderResponse } from './provider-http'

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

export interface ResendMessage {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

export async function sendViaResend(
  message: ResendMessage,
  opts: { baseDelayMs?: number, timeoutMs?: number } = {},
): Promise<ProviderResponse & { id?: string }> {
  const result = await callProvider({
    url: RESEND_EMAILS_URL,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${message.apiKey}`,
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    },
    retryOn: (status) => status === 429 || status >= 500,
    retryNetworkErrors: true,
    ...opts,
  })
  if (!result.ok) return result
  const id = (result.body as { id?: unknown }).id
  return typeof id === 'string' ? { ...result, id } : result
}
