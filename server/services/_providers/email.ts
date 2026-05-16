/**
 * server/services/_providers/email.ts — outbound email provider
 * (W3-1 / EH-J / ADR-0027).
 *
 * # Decisions (ADR-0008, ADR-0027)
 *   - Single `sendEmail({ to, subject, html, text })` API. The provider
 *     is selected by reading the active `provider_configs` row of
 *     kind `email` for the caller's org (or the supplied
 *     `organizationId`). If no row is active OR
 *     `BULWARK_NOTIFICATIONS_DISABLED=1`, we log + return a stub id.
 *   - **No new npm deps in Phase 1**. The `resend` branch calls the
 *     public HTTPS API directly with `fetch` — same payload shape the
 *     SDK uses. Promotion to the official SDK is a Phase 2 swap if
 *     ergonomics demand.
 *   - **Test mode default**: when `NODE_ENV === 'test'` or
 *     `BULWARK_NOTIFICATIONS_DISABLED=1` we never make a real network
 *     call. CI stays quiet and unit tests can assert on the stub id.
 *   - Returns `{ id, stub }`. `stub: true` means no provider call was
 *     attempted; receivers can branch on that for instrumentation.
 *
 * # Decisions cast down
 *   - Rejected: throwing on missing provider config. The notification
 *     subscriber must be defensive — a single missing provider can't
 *     poison the in-app + sms paths. We log + stub instead.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/client'
import { providerConfigs } from '../../db/schema/provider_configs'
import { and, eq } from 'drizzle-orm'
// W5-2 / ADR-0036 — provider rows store credentials sealed at rest.
import { unsealProviderConfig } from '../provider-config.real'

export interface SendEmailInput {
  organizationId: string
  to: string
  subject: string
  html?: string
  text?: string
}

export interface SendEmailResult {
  id: string
  stub: boolean
  provider: string
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
  if (isDisabled()) {
    return { id: `stub-${randomUUID()}`, stub: true, provider: 'stub' }
  }
  const cfg = await resolveActiveProvider(input.organizationId)
  if (!cfg) {
    // eslint-disable-next-line no-console
    console.log(`[email] (stub) to=${input.to} subject=${input.subject}`)
    return { id: `stub-${randomUUID()}`, stub: true, provider: 'stub' }
  }

  if (cfg.provider === 'resend') {
    const apiKey = typeof cfg.config.apiKey === 'string' ? cfg.config.apiKey : ''
    const from = typeof cfg.config.from === 'string' ? cfg.config.from : 'notifications@bulwark.local'
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[email] resend provider missing apiKey; falling back to stub')
      return { id: `stub-${randomUUID()}`, stub: true, provider: 'resend' }
    }
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
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[email] resend non-2xx status=${res.status}`)
        return { id: `stub-${randomUUID()}`, stub: true, provider: 'resend' }
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string }
      return { id: body.id ?? `resend-${randomUUID()}`, stub: false, provider: 'resend' }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[email] resend send failed', (err as Error).message)
      return { id: `stub-${randomUUID()}`, stub: true, provider: 'resend' }
    }
  }

  // Unknown provider — log + stub. Phase 2 may add postmark / sendgrid.
  // eslint-disable-next-line no-console
  console.log(`[email] (stub) provider=${cfg.provider} to=${input.to}`)
  return { id: `stub-${randomUUID()}`, stub: true, provider: cfg.provider }
}
