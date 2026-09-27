/**
 * server/services/_providers/email.ts — outbound email provider
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Single `sendEmail({ to, subject, html, text })` API. The provider
 *     is selected by reading the active `provider_configs` row of
 *     kind `email` for the caller's org (or the supplied
 *     `organizationId`). Development/test failures are ledgered as stubs;
 *     production transactional failures throw and fan-out failures return
 *     an explicit failed outcome.
 *   - **No new npm deps in Phase 1**. The `resend` branch calls the
 *     public HTTPS API directly with `fetch` — same payload shape the
 *     SDK uses. Promotion to the official SDK is a Phase 2 swap if
 *     ergonomics demand.
 *   - **Test mode default**: when `NODE_ENV === 'test'` or
 *     `BULWARK_NOTIFICATIONS_DISABLED=1` outside production, no network
 *     call is made. CI stays quiet and attempts are recorded as stubs.
 *   - Every attempt stores a keyed recipient hash; raw email addresses
 *     are not persisted in the delivery ledger.
 *
 * # Decisions cast down
 *   - Rejected: throwing on every fan-out failure. A missing provider
 *     must not poison the in-app notification path.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/client'
import { providerConfigs } from '../../db/schema/provider_configs'
import { and, eq } from 'drizzle-orm'
// W5-2 / ADR-0036 — provider rows store credentials sealed at rest.
import { unsealProviderConfig } from '../provider-config.real'
import { recordDeliveryAttempt } from './delivery-ledger'

type DeliveryMode = 'transactional' | 'fanout'

export interface SendEmailInput {
  organizationId: string
  to: string
  subject: string
  html?: string
  text?: string
  mode?: DeliveryMode
  eventType?: string
  relatedEntityType?: string
  relatedEntityId?: string
}

export interface SendEmailResult {
  id: string | null
  stub: boolean
  provider: string
  status: 'sent' | 'stubbed' | 'failed'
  error?: string
}

function isDisabled(): boolean {
  if (process.env.BULWARK_NOTIFICATIONS_DISABLED === '1') return true
  // Be quiet in CI / test environments by default.
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
          eq(providerConfigs.kind, 'email'),
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

/**
 * Send an email. Always resolves: on provider failure we log + return
 * a stub result so the caller's loop is never broken by a transient
 * outage. Promotion path: swap the inline `fetch` calls for the
 * provider's official SDK in Phase 2.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const production = process.env.NODE_ENV === 'production'
  const finish = async (
    provider: string,
    status: 'sent' | 'stubbed' | 'failed',
    opts: { id?: string | null; error?: string } = {},
  ): Promise<SendEmailResult> => {
    await recordDeliveryAttempt({
      organizationId: input.organizationId,
      channel: 'email',
      provider,
      recipient: input.to,
      status,
      providerMessageId: opts.id,
      error: opts.error,
      eventType: input.eventType,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    })
    if (status === 'failed' && input.mode !== 'fanout') {
      throw new Error(`Email delivery failed (${provider}): ${opts.error ?? 'unknown error'}`)
    }
    return {
      id: opts.id ?? (status === 'stubbed' ? `stub-${randomUUID()}` : null),
      stub: status === 'stubbed',
      provider,
      status,
      ...(opts.error ? { error: opts.error } : {}),
    }
  }
  const failure = (provider: string, error: string) => finish(provider, production ? 'failed' : 'stubbed', { error })

  if (isDisabled()) {
    if (production) return failure('disabled', 'Outbound notifications are disabled')
    return finish('stub', 'stubbed')
  }
  const cfg = await resolveActiveProvider(input.organizationId)
  if (!cfg) return failure('none', 'No active email provider is configured')

  if (cfg.provider !== 'resend') return failure(cfg.provider, 'Email provider is unsupported')
  const apiKey = typeof cfg.config.apiKey === 'string' ? cfg.config.apiKey : ''
  const from = typeof cfg.config.fromAddress === 'string'
    ? cfg.config.fromAddress
    : typeof cfg.config.from === 'string'
      ? cfg.config.from
      : ''
  if (!apiKey || !from) return failure('resend', 'Resend sender configuration is incomplete')

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html ?? `<p>${input.text ?? ''}</p>`,
        text: input.text ?? '',
      }),
    })
    if (!res.ok) return failure('resend', `Resend returned HTTP ${res.status}`)
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return finish('resend', 'sent', { id: body.id ?? `resend-${randomUUID()}` })
  } catch {
    return failure('resend', 'Resend request failed')
  }
}
