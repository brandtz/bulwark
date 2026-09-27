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
 *   - Development/test failures are recorded as stubs. Production
 *     transactional failures throw; fan-out failures return an explicit
 *     failed status for subscriber audit and reporting.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/client'
import { providerConfigs } from '../../db/schema/provider_configs'
import { and, eq } from 'drizzle-orm'
// W5-2 / ADR-0036 — provider rows store credentials sealed at rest.
import { unsealProviderConfig } from '../provider-config.real'
import { recordDeliveryAttempt } from './delivery-ledger'
import { sendViaTwilio } from '../comms/twilio-client'

type DeliveryMode = 'transactional' | 'fanout'

export interface SendSmsInput {
  organizationId: string
  to: string
  body: string
  mode?: DeliveryMode
  eventType?: string
  relatedEntityType?: string
  relatedEntityId?: string
  failureReason?: string
}

export interface SendSmsResult {
  id: string | null
  stub: boolean
  provider: string
  status: 'sent' | 'stubbed' | 'failed'
  error?: string
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
  const production = process.env.NODE_ENV === 'production'
  const finish = async (
    provider: string,
    status: 'sent' | 'stubbed' | 'failed',
    opts: { id?: string | null; error?: string; attempt?: number } = {},
  ): Promise<SendSmsResult> => {
    await recordDeliveryAttempt({
      organizationId: input.organizationId,
      channel: 'sms',
      provider,
      recipient: input.to,
      status,
      providerMessageId: opts.id,
      error: opts.error,
      eventType: input.eventType,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      attempt: opts.attempt,
    })
    if (status === 'failed' && input.mode !== 'fanout') {
      throw new Error(`SMS delivery failed (${provider}): ${opts.error ?? 'unknown error'}`)
    }
    return {
      id: opts.id ?? (status === 'stubbed' ? `stub-${randomUUID()}` : null),
      stub: status === 'stubbed',
      provider,
      status,
      ...(opts.error ? { error: opts.error } : {}),
    }
  }
  const failure = (provider: string, error: string, attempt?: number) =>
    finish(provider, production ? 'failed' : 'stubbed', { error, attempt })

  if (input.failureReason) return failure('none', input.failureReason)

  if (isDisabled()) {
    if (production) return failure('disabled', 'Outbound notifications are disabled')
    return finish('stub', 'stubbed')
  }
  const cfg = await resolveActiveProvider(input.organizationId)
  if (!cfg) return failure('none', 'No active SMS provider is configured')

  if (cfg.provider !== 'twilio') return failure(cfg.provider, 'SMS provider is unsupported')
  const accountSid = typeof cfg.config.accountSid === 'string' ? cfg.config.accountSid : ''
  const authToken = typeof cfg.config.authToken === 'string' ? cfg.config.authToken : ''
  const from = typeof cfg.config.from === 'string' ? cfg.config.from : ''
  if (!accountSid || !authToken || !from) return failure('twilio', 'Twilio configuration is incomplete')

  const result = await sendViaTwilio({ accountSid, authToken, from, to: input.to, body: input.body })
  if (!result.ok) return failure('twilio', `Twilio request failed: ${result.error}`, result.attempts)
  return finish('twilio', 'sent', { id: result.id ?? `twilio-${randomUUID()}`, attempt: result.attempts })
}
