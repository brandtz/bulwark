/**
 * server/services/_providers/sms.ts — outbound SMS provider
 * (W3-1 / EH-J / ADR-0027). Mirrors `email.ts` — see that file for
 * the full decisions block.
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Twilio is the Phase 1 reference; we call the public HTTPS API
 *     with `fetch` (no SDK dependency). Phase 2 may add the official
 *     `twilio` SDK if message-status callbacks become necessary.
 *   - `BULWARK_NOTIFICATIONS_DISABLED=1` (or NODE_ENV=test) keeps CI
 *     quiet by returning a stub id without network IO.
 *   - On any failure path we return `{ stub: true }`; the caller's
 *     fanout loop never fails because of one bad provider.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/client'
import { providerConfigs } from '../../db/schema/provider_configs'
import { and, eq } from 'drizzle-orm'
// W5-2 / ADR-0036 — provider rows store credentials sealed at rest.
import { unsealProviderConfig } from '../provider-config.real'

export interface SendSmsInput {
  organizationId: string
  to: string
  body: string
}

export interface SendSmsResult {
  id: string
  stub: boolean
  provider: string
}

function isDisabled(): boolean {
  if (process.env.BULWARK_NOTIFICATIONS_DISABLED === '1') return true
  if (process.env.NODE_ENV === 'test' && process.env.BULWARK_NOTIFICATIONS_DISABLED !== '0') {
    return true
  }
  return false
}

async function resolveActiveProvider(organizationId: string): Promise<{
  provider: string
  config: Record<string, unknown>
} | null> {
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(providerConfigs)
      .where(
        and(
          eq(providerConfigs.organizationId, organizationId),
          eq(providerConfigs.kind, 'sms'),
          eq(providerConfigs.isActive, true),
        ),
      )
      .limit(1)
    if (!row) return null
    return { provider: row.provider, config: unsealProviderConfig(row) }
  } catch {
    return null
  }
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  if (isDisabled()) {
    return { id: `stub-${randomUUID()}`, stub: true, provider: 'stub' }
  }
  const cfg = await resolveActiveProvider(input.organizationId)
  if (!cfg) {
    // eslint-disable-next-line no-console
    console.log(`[sms] (stub) to=${input.to} body=${input.body}`)
    return { id: `stub-${randomUUID()}`, stub: true, provider: 'stub' }
  }

  if (cfg.provider === 'twilio') {
    const accountSid = typeof cfg.config.accountSid === 'string' ? cfg.config.accountSid : ''
    const authToken = typeof cfg.config.authToken === 'string' ? cfg.config.authToken : ''
    const from = typeof cfg.config.from === 'string' ? cfg.config.from : ''
    if (!accountSid || !authToken || !from) {
      // eslint-disable-next-line no-console
      console.warn('[sms] twilio provider missing credentials; falling back to stub')
      return { id: `stub-${randomUUID()}`, stub: true, provider: 'twilio' }
    }
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      const params = new URLSearchParams({ To: input.to, From: from, Body: input.body })
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: params.toString(),
      })
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[sms] twilio non-2xx status=${res.status}`)
        return { id: `stub-${randomUUID()}`, stub: true, provider: 'twilio' }
      }
      const body = (await res.json().catch(() => ({}))) as { sid?: string }
      return { id: body.sid ?? `twilio-${randomUUID()}`, stub: false, provider: 'twilio' }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[sms] twilio send failed', (err as Error).message)
      return { id: `stub-${randomUUID()}`, stub: true, provider: 'twilio' }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[sms] (stub) provider=${cfg.provider} to=${input.to}`)
  return { id: `stub-${randomUUID()}`, stub: true, provider: cfg.provider }
}
