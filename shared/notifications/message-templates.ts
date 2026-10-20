/**
 * shared/notifications/message-templates.ts — Packet J message template registry (WP-J2).
 *
 * Covers all 17 message designs (MSG-01 … MSG-17) across email, SMS, in-app,
 * and push channels, keyed by (messageId | eventName) × channel.
 *
 * Invariants (WP-J2 acceptance):
 *   1. Rendering with a missing required variable throws a descriptive
 *      `MissingTemplateVariableError` in production mode (`mode: 'production'`)
 *      and renders a visible `[[missing:<var>]]` placeholder in dev mode.
 *   2. Tenant overrides from the label registry (`message.<MSG-ID>.<channel>.<field>`)
 *      replace subject, preheader, heading, body, or CTA text while preserving
 *      required variable validation.
 *   3. Email HTML wrapper uses table-based 600px layout with explicit light-only
 *      color-scheme metadata and high-contrast inline styles so dark-mode email
 *      clients never render black-on-black text (litmus-style contrast checks).
 */

export type MessageChannel = 'email' | 'sms' | 'inApp' | 'push'
export type RenderMode = 'production' | 'development'

export type MessageId =
  | 'MSG-01'
  | 'MSG-02'
  | 'MSG-03'
  | 'MSG-04'
  | 'MSG-05'
  | 'MSG-06'
  | 'MSG-07'
  | 'MSG-08'
  | 'MSG-09'
  | 'MSG-10'
  | 'MSG-11'
  | 'MSG-12'
  | 'MSG-13'
  | 'MSG-14'
  | 'MSG-15'
  | 'MSG-16'
  | 'MSG-17'

export const ALL_MESSAGE_IDS: readonly MessageId[] = [
  'MSG-01',
  'MSG-02',
  'MSG-03',
  'MSG-04',
  'MSG-05',
  'MSG-06',
  'MSG-07',
  'MSG-08',
  'MSG-09',
  'MSG-10',
  'MSG-11',
  'MSG-12',
  'MSG-13',
  'MSG-14',
  'MSG-15',
  'MSG-16',
  'MSG-17',
] as const

export class MissingTemplateVariableError extends Error {
  readonly messageId: MessageId
  readonly channel: MessageChannel
  readonly missingVariables: string[]

  constructor(messageId: MessageId, channel: MessageChannel, missingVariables: string[]) {
    super(
      `Message template ${messageId} (${channel}) is missing required variable(s): ${missingVariables.join(', ')}`,
    )
    this.name = 'MissingTemplateVariableError'
    this.messageId = messageId
    this.channel = channel
    this.missingVariables = missingVariables
  }
}

export interface ChannelTemplateSpec {
  subject?: string
  preheader?: string
  heading?: string
  body: string
  ctaLabel?: string
  ctaUrlVar?: string
  transactional?: boolean
  severity?: 'info' | 'success' | 'warning' | 'error'
}

export interface MessageTemplateDefinition {
  id: MessageId
  slug: string
  title: string
  eventNames: string[]
  requiredVariables: string[]
  optionalVariables?: string[]
  transactional: boolean
  channels: Partial<Record<MessageChannel, ChannelTemplateSpec>>
}

export interface RenderedMessage {
  id: MessageId
  channel: MessageChannel
  subject?: string
  preheader?: string
  text: string
  html?: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  missingVariables: string[]
}

export const MESSAGE_TEMPLATE_REGISTRY: Record<MessageId, MessageTemplateDefinition> = {
  'MSG-01': {
    id: 'MSG-01',
    slug: 'invite-to-organization',
    title: 'Invite to organization (staff, sub, homeowner, stakeholder)',
    eventNames: ['user.invited', 'homeowner.invited', 'sub.invited'],
    requiredVariables: ['org_name', 'inviter_name', 'role_label', 'accept_url'],
    optionalVariables: ['expires_on'],
    transactional: true,
    channels: {
      email: {
        subject: '{{inviter_name}} invited you to {{org_name}} on Bulwark',
        preheader: 'Set up your account and get access to jobs, quotes and the schedule.',
        heading: 'You have been invited to {{org_name}}',
        body: '{{inviter_name}} added you to the {{org_name}} workspace as {{role_label}}. Accept your invitation to get started.',
        ctaLabel: 'Accept Invitation',
        ctaUrlVar: 'accept_url',
        transactional: true,
      },
      inApp: {
        heading: 'Teammate invited',
        body: '{{inviter_name}} invited a {{role_label}} to {{org_name}}.',
        severity: 'info',
      },
    },
  },
  'MSG-02': {
    id: 'MSG-02',
    slug: 'password-reset',
    title: 'Password reset link',
    eventNames: ['auth.password_reset_requested'],
    requiredVariables: ['account_email', 'reset_url'],
    optionalVariables: ['expires_in_minutes', 'request_ip'],
    transactional: true,
    channels: {
      email: {
        subject: 'Reset your Bulwark password',
        preheader: 'This link works once and expires in 60 minutes.',
        heading: 'Reset your password',
        body: 'Someone asked to reset the password for {{account_email}}. If that was you, set a new password now.',
        ctaLabel: 'Reset Password',
        ctaUrlVar: 'reset_url',
        transactional: true,
      },
    },
  },
  'MSG-03': {
    id: 'MSG-03',
    slug: 'mfa-security',
    title: 'Two-factor authentication & security alert',
    eventNames: ['security.mfa_enrolled', 'security.mfa_disabled', 'security.password_changed'],
    requiredVariables: ['account_email', 'security_url'],
    optionalVariables: ['device_label'],
    transactional: true,
    channels: {
      email: {
        subject: 'Two-factor authentication is on for your account',
        preheader: 'Your account now asks for a code from your authenticator app.',
        heading: 'Two-factor authentication is on',
        body: 'Two-factor authentication was updated on {{account_email}}. Signing in now asks for a six-digit verification code.',
        ctaLabel: 'Review Security Settings',
        ctaUrlVar: 'security_url',
        transactional: true,
      },
      inApp: {
        heading: 'Security settings updated',
        body: 'Two-factor authentication was updated for {{account_email}}.',
        severity: 'info',
      },
    },
  },
  'MSG-04': {
    id: 'MSG-04',
    slug: 'magic-link',
    title: 'Passwordless magic sign-in link',
    eventNames: ['auth.magic_link_requested'],
    requiredVariables: ['org_name', 'magic_url'],
    optionalVariables: ['property_address'],
    transactional: true,
    channels: {
      email: {
        subject: 'Your sign-in link for {{org_name}}',
        preheader: 'Tap to open your portal. The link expires in 15 minutes.',
        heading: 'Your sign-in link',
        body: 'Open your portal at {{org_name}}. No password needed — this link works once and expires in 15 minutes.',
        ctaLabel: 'Sign In to Portal',
        ctaUrlVar: 'magic_url',
        transactional: true,
      },
      sms: {
        body: '{{org_name}}: your sign-in link is {{magic_url}} — expires in 15 min. Do not share it. Reply STOP to opt out.',
        transactional: true,
      },
    },
  },
  'MSG-05': {
    id: 'MSG-05',
    slug: 'quote-sent',
    title: 'Quote sent / reminder / expiring',
    eventNames: ['quote.sent', 'quote.reminder', 'quote.expiring'],
    requiredVariables: ['org_name', 'client_name', 'quote_number', 'property_address', 'quote_url'],
    optionalVariables: ['valid_until', 'starting_amount'],
    transactional: false,
    channels: {
      email: {
        subject: 'Your quote from {{org_name}} — {{property_address}}',
        preheader: 'Review your quote {{quote_number}} and select an option.',
        heading: 'Your quote {{quote_number}} is ready',
        body: '{{client_name}} — your quote {{quote_number}} for {{property_address}} is ready for review and approval.',
        ctaLabel: 'Review and Approve Quote',
        ctaUrlVar: 'quote_url',
      },
      sms: {
        body: '{{org_name}}: quote {{quote_number}} for {{property_address}} is ready. Review and approve: {{quote_url}} Reply STOP to opt out.',
      },
      inApp: {
        heading: 'Quote {{quote_number}} sent',
        body: 'Quote {{quote_number}} for {{property_address}} was sent to {{client_name}}.',
        severity: 'info',
      },
    },
  },
  'MSG-06': {
    id: 'MSG-06',
    slug: 'quote-accepted-declined',
    title: 'Quote accepted or declined by client',
    eventNames: ['quote.accepted', 'quote.rejected', 'quote.expired', 'quote.revised'],
    requiredVariables: ['quote_number', 'property_address', 'amount', 'quote_url'],
    optionalVariables: ['client_name', 'tier_label'],
    transactional: false,
    channels: {
      email: {
        subject: 'Quote {{quote_number}} accepted — {{amount}}',
        preheader: 'Deposit invoice is queued. Schedule the job.',
        heading: '{{quote_number}} accepted — {{amount}}',
        body: 'Quote {{quote_number}} for {{property_address}} was accepted for {{amount}}.',
        ctaLabel: 'Open Quote',
        ctaUrlVar: 'quote_url',
      },
      inApp: {
        heading: 'Quote {{quote_number}} accepted',
        body: 'Quote {{quote_number}} at {{property_address}} was accepted ({{amount}}).',
        severity: 'success',
      },
    },
  },
  'MSG-07': {
    id: 'MSG-07',
    slug: 'appointment',
    title: 'Appointment scheduled / crew arriving / rescheduled',
    eventNames: ['work_order.scheduled', 'schedule.appointment_booked', 'schedule.crew_arriving'],
    requiredVariables: ['org_name', 'property_address', 'start_window', 'portal_url'],
    optionalVariables: ['crew_lead_name', 'duration_label'],
    transactional: false,
    channels: {
      email: {
        subject: 'Your crew is booked for {{start_window}}',
        preheader: 'Work at {{property_address}} is scheduled.',
        heading: 'Your work is scheduled',
        body: 'Work at {{property_address}} is booked with {{org_name}} starting {{start_window}}.',
        ctaLabel: 'See Schedule',
        ctaUrlVar: 'portal_url',
      },
      sms: {
        body: '{{org_name}}: work at {{property_address}} starts {{start_window}}. Details: {{portal_url}} STOP to opt out.',
      },
      inApp: {
        heading: 'Appointment scheduled',
        body: '{{property_address}} scheduled for {{start_window}}.',
        severity: 'info',
      },
    },
  },
  'MSG-08': {
    id: 'MSG-08',
    slug: 'job-assigned-sub',
    title: 'Job offer or slot assigned to subcontractor',
    eventNames: ['work_order.slot_assigned', 'sub.quote_responded', 'work_order.created'],
    requiredVariables: ['org_name', 'sub_name', 'trade_label', 'property_address', 'date_range', 'accept_url'],
    optionalVariables: ['amount'],
    transactional: false,
    channels: {
      email: {
        subject: 'Job offer: {{trade_label}}, {{property_address}} — {{date_range}}',
        preheader: 'Review scope and confirm availability.',
        heading: 'Job offer — {{trade_label}}',
        body: '{{sub_name}} — {{org_name}} assigned {{trade_label}} at {{property_address}} for {{date_range}}.',
        ctaLabel: 'Review Assignment',
        ctaUrlVar: 'accept_url',
      },
      sms: {
        body: '{{org_name}}: job offer for {{sub_name}} — {{trade_label}}, {{property_address}}, {{date_range}}. Confirm: {{accept_url}} STOP to opt out.',
      },
      inApp: {
        heading: 'Slot assigned — {{trade_label}}',
        body: '{{sub_name}} assigned to {{trade_label}} at {{property_address}} ({{date_range}}).',
        severity: 'info',
      },
    },
  },
  'MSG-09': {
    id: 'MSG-09',
    slug: 'invoice',
    title: 'Invoice ready / payment reminder / overdue notice',
    eventNames: ['invoice.sent', 'invoice.overdue', 'invoice.voided'],
    requiredVariables: ['org_name', 'invoice_number', 'amount_due', 'due_date', 'property_address', 'pay_url'],
    optionalVariables: ['client_name'],
    transactional: false,
    channels: {
      email: {
        subject: 'Invoice {{invoice_number}} — {{amount_due}} due {{due_date}}',
        preheader: 'Pay online by card or ACH.',
        heading: 'Invoice {{invoice_number}} — {{amount_due}}',
        body: 'Invoice {{invoice_number}} for {{property_address}} ({{amount_due}}) is due {{due_date}}.',
        ctaLabel: 'Pay Invoice',
        ctaUrlVar: 'pay_url',
      },
      sms: {
        body: '{{org_name}}: invoice {{invoice_number}} for {{amount_due}} is due {{due_date}}. Pay: {{pay_url}} STOP to opt out.',
      },
      inApp: {
        heading: 'Invoice {{invoice_number}} issued',
        body: '{{amount_due}} due {{due_date}} for {{property_address}}.',
        severity: 'info',
      },
    },
  },
  'MSG-10': {
    id: 'MSG-10',
    slug: 'payment-received',
    title: 'Payment receipt & confirmation',
    eventNames: ['invoice.marked_paid', 'invoice.partial_paid'],
    requiredVariables: ['org_name', 'invoice_number', 'amount_paid', 'balance_remaining', 'receipt_url'],
    optionalVariables: ['payment_method'],
    transactional: true,
    channels: {
      email: {
        subject: 'Payment received for {{invoice_number}} — {{amount_paid}}',
        preheader: 'Thank you. Your payment receipt is ready.',
        heading: 'Payment received — {{amount_paid}}',
        body: 'We received {{amount_paid}} toward invoice {{invoice_number}} at {{org_name}}. Remaining balance: {{balance_remaining}}.',
        ctaLabel: 'View Receipt',
        ctaUrlVar: 'receipt_url',
        transactional: true,
      },
      inApp: {
        heading: 'Payment received — {{amount_paid}}',
        body: 'Applied to {{invoice_number}}. Balance {{balance_remaining}}.',
        severity: 'success',
      },
    },
  },
  'MSG-11': {
    id: 'MSG-11',
    slug: 'deliverable-ready',
    title: 'Compliance package / completion report / warranty ready',
    eventNames: ['compliance_doc.ready', 'deliverable.ready'],
    requiredVariables: ['org_name', 'deliverable_title', 'property_address', 'document_url'],
    optionalVariables: ['certificate_number'],
    transactional: false,
    channels: {
      email: {
        subject: '{{deliverable_title}} ready — {{property_address}}',
        preheader: 'Download your verified PDF package.',
        heading: 'Your {{deliverable_title}} is ready',
        body: '{{org_name}} published the {{deliverable_title}} for {{property_address}}.',
        ctaLabel: 'Download Document',
        ctaUrlVar: 'document_url',
      },
      inApp: {
        heading: '{{deliverable_title}} ready',
        body: '{{deliverable_title}} for {{property_address}} is ready to download.',
        severity: 'success',
      },
    },
  },
  'MSG-12': {
    id: 'MSG-12',
    slug: 'compliance-expiring',
    title: 'COI or permit expiring soon / expired',
    eventNames: ['sub.coi_expiring_soon', 'sub.coi_uploaded', 'permit.expiring_soon'],
    requiredVariables: ['org_name', 'vendor_name', 'expires_on', 'days_remaining', 'upload_url'],
    optionalVariables: ['jobs_affected'],
    transactional: false,
    channels: {
      email: {
        subject: 'Certificate of Insurance expires {{expires_on}} ({{days_remaining}} days)',
        preheader: 'Upload a renewed COI to avoid holding scheduled jobs.',
        heading: 'COI expires in {{days_remaining}} days',
        body: '{{vendor_name}} Certificate of Insurance with {{org_name}} expires on {{expires_on}}.',
        ctaLabel: 'Upload Renewed COI',
        ctaUrlVar: 'upload_url',
      },
      inApp: {
        heading: 'COI expires in {{days_remaining}} days',
        body: '{{vendor_name}} COI expires {{expires_on}}.',
        severity: 'warning',
      },
    },
  },
  'MSG-13': {
    id: 'MSG-13',
    slug: 'job-complete-review',
    title: 'Job complete & client review request',
    eventNames: ['work_order.completed', 'change_order.proposed', 'change_order.approved'],
    requiredVariables: ['org_name', 'property_address', 'completed_on', 'report_url'],
    optionalVariables: ['review_url'],
    transactional: false,
    channels: {
      email: {
        subject: 'Your work is finished — {{property_address}}',
        preheader: 'Final inspection passed. Completion report ready.',
        heading: 'The work is finished',
        body: 'Work at {{property_address}} by {{org_name}} was completed on {{completed_on}}.',
        ctaLabel: 'See Completion Report',
        ctaUrlVar: 'report_url',
      },
      sms: {
        body: '{{org_name}}: work at {{property_address}} is finished ({{completed_on}}). Report: {{report_url}} STOP to opt out.',
      },
      inApp: {
        heading: 'Job completed — {{property_address}}',
        body: 'Completed on {{completed_on}}.',
        severity: 'success',
      },
    },
  },
  'MSG-14': {
    id: 'MSG-14',
    slug: 'service-ticket',
    title: 'Warranty / service ticket received, scheduled, or resolved',
    eventNames: ['ticket.created', 'ticket.scheduled', 'ticket.resolved'],
    requiredVariables: ['org_name', 'ticket_number', 'issue_summary', 'priority_label', 'ticket_url'],
    optionalVariables: ['property_address'],
    transactional: false,
    channels: {
      email: {
        subject: 'We have your service request — ticket {{ticket_number}}',
        preheader: '{{issue_summary}} ({{priority_label}}).',
        heading: 'We have your service request',
        body: 'Service ticket {{ticket_number}} ({{issue_summary}}) is logged as {{priority_label}} with {{org_name}}.',
        ctaLabel: 'Track Ticket',
        ctaUrlVar: 'ticket_url',
      },
      sms: {
        body: '{{org_name}}: ticket {{ticket_number}} logged ({{priority_label}} — {{issue_summary}}). Track: {{ticket_url}} STOP to opt out.',
      },
      inApp: {
        heading: 'Service ticket {{ticket_number}}',
        body: '{{issue_summary}} · Triaged as {{priority_label}}.',
        severity: 'warning',
      },
    },
  },
  'MSG-15': {
    id: 'MSG-15',
    slug: 'digest',
    title: 'Daily operations digest & stakeholder portfolio brief',
    eventNames: ['digest.daily_admin', 'digest.stakeholder_brief'],
    requiredVariables: ['org_name', 'digest_date', 'active_jobs_count', 'attention_items_count', 'dashboard_url'],
    optionalVariables: ['summary_line'],
    transactional: false,
    channels: {
      email: {
        subject: '{{digest_date}}: {{active_jobs_count}} jobs running, {{attention_items_count}} things need you',
        preheader: 'Daily summary for {{org_name}}.',
        heading: '{{digest_date}} — {{org_name}}',
        body: '{{active_jobs_count}} jobs active today and {{attention_items_count}} items need your attention.',
        ctaLabel: 'Open Dashboard',
        ctaUrlVar: 'dashboard_url',
      },
    },
  },
  'MSG-16': {
    id: 'MSG-16',
    slug: 'account-deletion',
    title: 'Account deletion scheduled / cancelled / completed',
    eventNames: ['account.deletion_requested', 'account.deletion_cancelled'],
    requiredVariables: ['account_email', 'deletion_date', 'cancel_url'],
    optionalVariables: ['export_url'],
    transactional: true,
    channels: {
      email: {
        subject: 'Your account is scheduled for deletion on {{deletion_date}}',
        preheader: '30 days to change your mind. Here is what gets removed.',
        heading: 'Your account will be deleted on {{deletion_date}}',
        body: 'We received a request to delete the account for {{account_email}}. It is scheduled for {{deletion_date}} (30-day grace period).',
        ctaLabel: 'Cancel Deletion',
        ctaUrlVar: 'cancel_url',
        transactional: true,
      },
    },
  },
  'MSG-17': {
    id: 'MSG-17',
    slug: 'notification-pattern',
    title: 'In-app notification row + Web Push notification card',
    eventNames: ['notification.generic', 'push.notification'],
    requiredVariables: ['title', 'body', 'deep_link'],
    optionalVariables: ['severity', 'channel_id'],
    transactional: false,
    channels: {
      inApp: {
        heading: '{{title}}',
        body: '{{body}}',
        severity: 'info',
      },
      push: {
        heading: '{{title}}',
        body: '{{body}}',
        ctaUrlVar: 'deep_link',
        severity: 'info',
      },
    },
  },
}

const EVENT_TO_MESSAGE_ID: Record<string, MessageId> = {}
for (const def of Object.values(MESSAGE_TEMPLATE_REGISTRY)) {
  for (const ev of def.eventNames) {
    EVENT_TO_MESSAGE_ID[ev] = def.id
  }
}

export function resolveMessageIdForEvent(eventOrMessageId: string): MessageId | null {
  if (eventOrMessageId in MESSAGE_TEMPLATE_REGISTRY) {
    return eventOrMessageId as MessageId
  }
  return EVENT_TO_MESSAGE_ID[eventOrMessageId] ?? null
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function interpolate(
  template: string,
  variables: Record<string, unknown>,
  missingSet: Set<string>,
  escapeForHtml = false,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName: string) => {
    const val = variables[varName]
    if (val === undefined || val === null || String(val).trim() === '') {
      missingSet.add(varName)
      return `[[missing:${varName}]]`
    }
    const str = String(val)
    return escapeForHtml ? escapeHtml(str) : str
  })
}

function buildLitmusSafeEmailHtml(opts: {
  orgName: string
  accentColor: string
  preheader: string
  heading: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  transactional: boolean
}): string {
  const accent = /^#[\da-fA-F]{6}$/.test(opts.accentColor) ? opts.accentColor : '#0F766E'
  const orgUpper = escapeHtml(opts.orgName.startsWith('[[missing:') ? opts.orgName : opts.orgName.toUpperCase())
  const preheader = escapeHtml(opts.preheader)
  const heading = escapeHtml(opts.heading)
  const footerNotice = opts.transactional
    ? 'Transactional security and account notices cannot be turned off.'
    : 'Manage your notification preferences in your Bulwark account settings.'

  const ctaBlock =
    opts.ctaLabel && opts.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td align="center" bgcolor="${accent}" style="background-color:${accent};border-radius:6px"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#ffffff;background-color:${accent};text-decoration:none;border-radius:6px;min-height:44px;box-sizing:border-box">${escapeHtml(opts.ctaLabel)}</a></td></tr></table>`
      : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head><body style="margin:0;padding:0;background-color:#E6EAEE;color:#161B22"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#E6EAEE" style="background-color:#E6EAEE;color:#161B22;margin:0;padding:0"><tr><td align="center" style="padding:24px 12px"><div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#E6EAEE">${preheader}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;color:#161B22;border:1px solid #D9DEE4"><tr><td style="padding:20px 28px 16px;background-color:#ffffff;color:#161B22"><table role="presentation" width="100%"><tr><td style="font:800 19px/1 'Barlow',Helvetica,Arial,sans-serif;letter-spacing:.02em;color:${accent};background-color:#ffffff">${orgUpper}</td></tr></table></td></tr><tr><td style="height:3px;background-color:${accent};line-height:3px;font-size:0">&nbsp;</td></tr><tr><td style="padding:26px 28px 16px;background-color:#ffffff;color:#161B22"><h1 style="margin:0 0 12px;font:700 21px/1.25 'Barlow',Helvetica,Arial,sans-serif;color:#161B22;background-color:#ffffff">${heading}</h1><p style="margin:0 0 14px;font:400 15px/1.6 'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#2C323B;background-color:#ffffff">${opts.bodyHtml}</p>${ctaBlock}</td></tr><tr><td style="padding:0 28px 24px;background-color:#ffffff;color:#5B6470"><div style="height:1px;background-color:#D9DEE4;margin:0 0 18px"></div><p style="margin:0;font:400 11px/1.55 'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#5B6470;background-color:#ffffff">${escapeHtml(footerNotice)}</p></td></tr></table></td></tr></table></body></html>`
}

export interface RenderMessageOptions {
  idOrEvent: MessageId | string
  channel: MessageChannel
  variables: Record<string, unknown>
  mode?: RenderMode
  /** Optional tenant label overrides keyed by `message.<MSG-ID>.<channel>.<field>` */
  labelOverrides?: Record<string, string>
  accentColor?: string
}

export function renderMessageTemplate(opts: RenderMessageOptions): RenderedMessage {
  const mode: RenderMode =
    opts.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  const msgId = resolveMessageIdForEvent(opts.idOrEvent)
  if (!msgId) {
    throw new Error(`Unknown message template or event: ${opts.idOrEvent}`)
  }

  const def = MESSAGE_TEMPLATE_REGISTRY[msgId]
  const channelSpec = def.channels[opts.channel]
  if (!channelSpec) {
    throw new Error(`Message template ${msgId} does not support channel ${opts.channel}`)
  }

  const missingSet = new Set<string>()
  for (const reqVar of def.requiredVariables) {
    const val = opts.variables[reqVar]
    if (val === undefined || val === null || String(val).trim() === '') {
      missingSet.add(reqVar)
    }
  }

  const ov = opts.labelOverrides ?? {}
  const prefix = `message.${msgId}.${opts.channel}`
  const rawSubject =
    ov[`${prefix}.subject`] ??
    (opts.channel === 'email' ? ov[`email.subject.${msgId}`] : undefined) ??
    channelSpec.subject
  const rawPreheader = ov[`${prefix}.preheader`] ?? channelSpec.preheader ?? ''
  const rawHeading = ov[`${prefix}.heading`] ?? channelSpec.heading ?? def.title
  const rawBody =
    ov[`${prefix}.body`] ??
    (opts.channel === 'email' ? ov[`email.body.${msgId}`] : undefined) ??
    (opts.channel === 'sms' ? ov[`sms.body.${msgId}`] : undefined) ??
    channelSpec.body
  const rawCtaLabel = ov[`${prefix}.ctaLabel`] ?? channelSpec.ctaLabel

  const subject = rawSubject ? interpolate(rawSubject, opts.variables, missingSet, false) : undefined
  const preheader = rawPreheader ? interpolate(rawPreheader, opts.variables, missingSet, false) : undefined
  const heading = interpolate(rawHeading, opts.variables, missingSet, false)
  const textBody = interpolate(rawBody, opts.variables, missingSet, false)
  const htmlBody = interpolate(rawBody, opts.variables, missingSet, true)

  if (missingSet.size > 0 && mode === 'production') {
    throw new MissingTemplateVariableError(msgId, opts.channel, [...missingSet])
  }

  let html: string | undefined
  if (opts.channel === 'email') {
    const ctaUrl = channelSpec.ctaUrlVar ? String(opts.variables[channelSpec.ctaUrlVar] ?? '') : undefined
    const rawOrgName = opts.variables.org_name
    const orgName =
      rawOrgName !== undefined && rawOrgName !== null && String(rawOrgName).trim() !== ''
        ? String(rawOrgName)
        : def.requiredVariables.includes('org_name')
          ? '[[missing:org_name]]'
          : 'Bulwark'
    html = buildLitmusSafeEmailHtml({
      orgName,
      accentColor: opts.accentColor ?? '#0F766E',
      preheader: preheader ?? heading,
      heading,
      bodyHtml: htmlBody,
      ctaLabel: rawCtaLabel,
      ctaUrl,
      transactional: channelSpec.transactional ?? def.transactional,
    })
  }

  return {
    id: msgId,
    channel: opts.channel,
    subject,
    preheader,
    text: opts.channel === 'inApp' || opts.channel === 'push' ? `${heading} — ${textBody}` : textBody,
    html,
    severity: channelSpec.severity ?? 'info',
    missingVariables: [...missingSet],
  }
}
