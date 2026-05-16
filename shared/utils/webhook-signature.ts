/**
 * shared/utils/webhook-signature.ts — HMAC-SHA256 signature for outbound
 * webhooks (W2-4 / EH-H Part B / ADR-0022).
 *
 * # Decisions
 *   - Algorithm: `hmac-sha256` over the raw JSON body. Header:
 *     `X-Bulwark-Signature: hmac-sha256=<hex>`.
 *   - Implementation uses `node:crypto`; mocks in the browser bundle
 *     never need to actually sign (tests run under node/vitest).
 */
import { createHmac } from 'node:crypto'
import {
  WEBHOOK_SIGNATURE_ALGORITHM,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookSignaturePieces,
} from '../contracts/webhook'

/** Compute the canonical signature value for a body + secret. */
export function signWebhookPayload(body: string, secret: string): WebhookSignaturePieces {
  const hmac = createHmac('sha256', secret).update(body).digest('hex')
  return {
    header: WEBHOOK_SIGNATURE_HEADER,
    algorithm: WEBHOOK_SIGNATURE_ALGORITHM,
    value: `${WEBHOOK_SIGNATURE_ALGORITHM}=${hmac}`,
  }
}

/** Verify a signature value against a body + secret. Constant-time. */
export function verifyWebhookSignature(body: string, secret: string, value: string): boolean {
  const expected = signWebhookPayload(body, secret).value
  if (expected.length !== value.length) return false
  // constant-time compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i)
  return diff === 0
}
