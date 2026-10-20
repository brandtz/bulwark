/**
 * tests/unit/notification-templates.test.ts — W3-1.
 *
 * Exercises `renderNotification()` for every templated event name in
 * the catalog. Each render must produce a non-empty title + body and
 * a valid severity.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_MESSAGE_IDS,
  MESSAGE_TEMPLATE_REGISTRY,
  MissingTemplateVariableError,
  renderMessageTemplate,
  renderNotification,
  TEMPLATED_EVENT_NAMES,
  type MessageId,
} from '~~/shared/notifications/templates'

const VALID_SEVERITIES = new Set(['info', 'success', 'warning', 'error'])

const PAYLOAD_BY_EVENT: Record<string, Record<string, unknown>> = {
  'quote.accepted': { quoteNumber: 'Q-1001', entityId: '11111111-1111-1111-1111-111111111111' },
  'quote.rejected': { quoteNumber: 'Q-1002', reason: 'too high', entityId: '22222222-2222-2222-2222-222222222222' },
  'quote.expired': { quoteNumber: 'Q-1003', entityId: '33333333-3333-3333-3333-333333333333' },
  'quote.revised': { quoteNumber: 'Q-1004', revisionNumber: 2, entityId: '44444444-4444-4444-4444-444444444444' },
  'work_order.created': { workOrderNumber: 'WO-2001', entityId: '55555555-5555-5555-5555-555555555555' },
  'work_order.scheduled': { workOrderNumber: 'WO-2002', scheduledStart: '2026-06-01T09:00:00Z', entityId: '66666666-6666-6666-6666-666666666666' },
  'invoice.marked_paid': { invoiceNumber: 'INV-3001', paidAmountCents: 125000, entityId: '77777777-7777-7777-7777-777777777777' },
  'invoice.partial_paid': { invoiceNumber: 'INV-3002', paidSoFarCents: 50000, remainingCents: 75000, entityId: '88888888-8888-8888-8888-888888888888' },
  'invoice.voided': { invoiceNumber: 'INV-3003', reason: 'duplicate', entityId: '99999999-9999-9999-9999-999999999999' },
  'compliance_doc.ready': { entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
  'change_order.proposed': { amountCents: 25000, entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
  'change_order.approved': { amountCents: 30000, approvedByName: 'Drew Owens', entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
  'user.invited': { email: 'new@example.com', role: 'field', entityId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
}

const SAMPLE_VARS_BY_MSG: Record<MessageId, Record<string, string>> = {
  'MSG-01': {
    org_name: 'Northline Contracting',
    inviter_name: 'Luis Ortega',
    role_label: 'Project manager',
    accept_url: 'https://bulwark.example/accept-invite?token=abc',
  },
  'MSG-02': {
    account_email: 'luis@northlinecontracting.com',
    reset_url: 'https://bulwark.example/reset-password?token=xyz',
  },
  'MSG-03': {
    account_email: 'maya@northlinecontracting.com',
    security_url: 'https://bulwark.example/profile/security',
  },
  'MSG-04': {
    org_name: 'Northline Contracting',
    magic_url: 'https://bulwark.example/magic?token=m1',
  },
  'MSG-05': {
    org_name: 'Northline Contracting',
    client_name: 'Priya Nair',
    quote_number: 'Q-1042',
    property_address: '1842 Rimrock Rd',
    quote_url: 'https://bulwark.example/homeowner/quotes/q1',
  },
  'MSG-06': {
    quote_number: 'Q-1042',
    property_address: '1842 Rimrock Rd',
    amount: '$22,950.00',
    quote_url: 'https://bulwark.example/admin/quotes/q1',
  },
  'MSG-07': {
    org_name: 'Northline Contracting',
    property_address: '1842 Rimrock Rd',
    start_window: 'Thu Sep 10, 7:30-8:00 a.m.',
    portal_url: 'https://bulwark.example/homeowner',
  },
  'MSG-08': {
    org_name: 'Northline Contracting',
    sub_name: 'Apex Roofing Co.',
    trade_label: 'Roofing',
    property_address: '1842 Rimrock Rd',
    date_range: 'Sep 11-14',
    accept_url: 'https://bulwark.example/sub/quotes',
  },
  'MSG-09': {
    org_name: 'Northline Contracting',
    invoice_number: 'INV-3107',
    amount_due: '$16,065.00',
    due_date: 'Sep 28, 2026',
    property_address: '1842 Rimrock Rd',
    pay_url: 'https://bulwark.example/homeowner/invoices/inv1',
  },
  'MSG-10': {
    org_name: 'Northline Contracting',
    invoice_number: 'INV-3107',
    amount_paid: '$16,065.00',
    balance_remaining: '$0.00',
    receipt_url: 'https://bulwark.example/homeowner/invoices/inv1',
  },
  'MSG-11': {
    org_name: 'Northline Contracting',
    deliverable_title: 'Compliance Package',
    property_address: '1842 Rimrock Rd',
    document_url: 'https://bulwark.example/homeowner/documents/d1',
  },
  'MSG-12': {
    org_name: 'Northline Contracting',
    vendor_name: 'Apex Roofing Co.',
    expires_on: 'Oct 1, 2026',
    days_remaining: '14',
    upload_url: 'https://bulwark.example/sub/cois',
  },
  'MSG-13': {
    org_name: 'Northline Contracting',
    property_address: '1842 Rimrock Rd',
    completed_on: 'Sep 15, 2026',
    report_url: 'https://bulwark.example/homeowner/documents/r1',
  },
  'MSG-14': {
    org_name: 'Northline Contracting',
    ticket_number: 'SR-0412',
    issue_summary: 'Water staining near chimney',
    priority_label: 'Urgent',
    ticket_url: 'https://bulwark.example/homeowner/requests/sr1',
  },
  'MSG-15': {
    org_name: 'Northline Contracting',
    digest_date: 'Thursday, Sep 17',
    active_jobs_count: '3',
    attention_items_count: '2',
    dashboard_url: 'https://bulwark.example/admin',
  },
  'MSG-16': {
    account_email: 'sam@northlinecontracting.com',
    deletion_date: 'Oct 17, 2026',
    cancel_url: 'https://bulwark.example/profile/data',
  },
  'MSG-17': {
    title: 'Crew arriving about 7:40 a.m.',
    body: 'Dev Patel and Crew A are on the way to 1842 Rimrock Rd.',
    deep_link: 'https://bulwark.example/field',
  },
}

describe('renderNotification', () => {
  for (const name of TEMPLATED_EVENT_NAMES) {
    it(`renders ${name}`, () => {
      const payload = PAYLOAD_BY_EVENT[name] ?? {}
      const r = renderNotification(name, payload)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.body.length).toBeGreaterThan(0)
      expect(VALID_SEVERITIES.has(r.severity)).toBe(true)
    })
  }

  it('renders a generic fallback for unknown events', () => {
    const r = renderNotification('made.up.event', { entityId: 'abc' })
    expect(r.title.length).toBeGreaterThan(0)
    expect(r.severity).toBe('info')
  })

  it('uses success severity for paid invoices', () => {
    const r = renderNotification('invoice.marked_paid', { invoiceNumber: 'X', paidAmountCents: 100, entityId: 'e' })
    expect(r.severity).toBe('success')
  })

  it('uses warning severity for voided invoices', () => {
    const r = renderNotification('invoice.voided', { invoiceNumber: 'X', reason: 'r', entityId: 'e' })
    expect(r.severity).toBe('warning')
  })
})

describe('Packet J message templates (WP-J2: MSG-01 … MSG-17)', () => {
  it('registers all 17 message templates', () => {
    expect(ALL_MESSAGE_IDS).toHaveLength(17)
    for (const id of ALL_MESSAGE_IDS) {
      expect(MESSAGE_TEMPLATE_REGISTRY[id]).toBeDefined()
      expect(MESSAGE_TEMPLATE_REGISTRY[id].requiredVariables.length).toBeGreaterThan(0)
    }
  })

  it('rejects channels that a message template does not define', () => {
    expect(() =>
      renderMessageTemplate({
        idOrEvent: 'MSG-02',
        channel: 'sms',
        variables: SAMPLE_VARS_BY_MSG['MSG-02'],
      }),
    ).toThrow('Message template MSG-02 does not support channel sms')
  })

  for (const id of ALL_MESSAGE_IDS) {
    const def = MESSAGE_TEMPLATE_REGISTRY[id]
    const primaryChannel = ('email' in def.channels ? 'email' : 'inApp') as 'email' | 'inApp'

    it(`renders ${id} (${def.slug}) cleanly with all required variables`, () => {
      const rendered = renderMessageTemplate({
        idOrEvent: id,
        channel: primaryChannel,
        variables: SAMPLE_VARS_BY_MSG[id],
        mode: 'production',
      })
      expect(rendered.id).toBe(id)
      expect(rendered.text.length).toBeGreaterThan(10)
      expect(rendered.text).not.toContain('[[missing:')
      expect(rendered.missingVariables).toEqual([])
      if (primaryChannel === 'email') {
        expect(rendered.subject).toBeTruthy()
        expect(rendered.html).toContain('<!doctype html>')
      }
    })

    it(`${id}: missing required variable fails loudly in prod mode and renders placeholder in dev mode`, () => {
      const reqVar = def.requiredVariables[0]!
      const incompleteVars = Object.fromEntries(
        Object.entries(SAMPLE_VARS_BY_MSG[id]).filter(([k]) => k !== reqVar),
      )

      // Negative (production): throws MissingTemplateVariableError naming the variable
      expect(() =>
        renderMessageTemplate({
          idOrEvent: id,
          channel: primaryChannel,
          variables: incompleteVars,
          mode: 'production',
        }),
      ).toThrowError(MissingTemplateVariableError)

      // Development: renders placeholder without throwing
      const devRendered = renderMessageTemplate({
        idOrEvent: id,
        channel: primaryChannel,
        variables: incompleteVars,
        mode: 'development',
      })
      expect(devRendered.missingVariables).toContain(reqVar)
      const combined = `${devRendered.subject ?? ''} ${devRendered.text} ${devRendered.html ?? ''}`
      expect(combined).toContain(`[[missing:${reqVar}]]`)
    })
  }

  it('dark-mode email snapshot passes litmus-style checks (no black-on-black, explicit light color-scheme and paired background/text colors)', () => {
    for (const id of ALL_MESSAGE_IDS) {
      const def = MESSAGE_TEMPLATE_REGISTRY[id]
      if (!def.channels.email) continue
      const rendered = renderMessageTemplate({
        idOrEvent: id,
        channel: 'email',
        variables: SAMPLE_VARS_BY_MSG[id],
        mode: 'production',
      })
      const html = rendered.html!
      expect(html).toContain('<meta name="color-scheme" content="light only">')
      expect(html).toContain('<meta name="supported-color-schemes" content="light only">')
      // Litmus check: every styled block with dark text (#161B22 or #2C323B) explicitly pairs background-color:#ffffff or #E6EAEE
      expect(html).not.toMatch(/background-color:\s*#(000|000000|161B22)[^"]*color:\s*#(000|000000|161B22)/i)
      expect(html).toContain('background-color:#ffffff;color:#161B22')
    }
  })

  it('applies tenant overrides via labels while enforcing required variables', () => {
    const rendered = renderMessageTemplate({
      idOrEvent: 'MSG-05',
      channel: 'email',
      variables: SAMPLE_VARS_BY_MSG['MSG-05'],
      mode: 'production',
      labelOverrides: {
        'email.subject.MSG-05': 'Custom Estimate {{quote_number}} for {{property_address}}',
      },
    })
    expect(rendered.subject).toBe('Custom Estimate Q-1042 for 1842 Rimrock Rd')
  })
})
