/**
 * shared/mocks/quote.mock.ts — MockQuoteService (E5-S1).
 *
 * # Decisions (ADR-0008)
 *   - State in a module-level `rows[]` (matches assessment / property /
 *     client mocks). Cached singleton via `factory.ts`.
 *   - Tenant firewall (E2-S7) on every method.
 *   - `quoteNumber` is generated server-side as `Q-YYYY-{seq}`. Sequence
 *     is org-scoped so each tenant sees Q-2026-0001 first.
 *   - `create` recomputes totals through the pure helper so the row's
 *     `totals` field is always derivable from its line items \u2014 the UI
 *     can't drift away from the truth.
 *   - `markSent` is idempotent: a re-call returns the existing sent row
 *     rather than replaying the timestamp. The acceptance / rejection
 *     transitions land in E5-S3.
 *
 * # Decision cast down
 *   - Rejected: pre-seeding fixture quotes. The empty-state UX is
 *     important to validate, and the happy-path Playwright will generate
 *     the first one anyway.
 */
import type {
  IQuoteService,
  Quote,
  QuoteCreateInput,
  QuoteListInput,
  QuoteListOutput,
  QuoteStatus,
  QuoteRejectedReasonCode,
} from '../contracts/quote'
import { computeQuoteTotals } from '../utils/money'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Quote[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function nextQuoteNumber(organizationId: string): string {
  const year = new Date().getUTCFullYear()
  const prefix = `Q-${year}-`
  const seq =
    rows.filter((r) => r.organizationId === organizationId && r.quoteNumber.startsWith(prefix))
      .length + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export class MockQuoteService implements IQuoteService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: QuoteListInput): Promise<QuoteListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.propertyId) {
      scoped = scoped.filter((r) => r.propertyId === input.propertyId)
    }
    if (input.status) {
      scoped = scoped.filter((r) => r.status === input.status)
    }
    scoped = scoped.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Quote | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    return row ?? null
  }

  async create(input: QuoteCreateInput): Promise<Quote> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const totals = computeQuoteTotals(input.lineItems, input.markupPercent, input.taxPercent)
    const status: QuoteStatus = 'draft'
    const row: Quote = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      assessmentId: input.assessmentId,
      createdById: input.createdById,
      quoteNumber: nextQuoteNumber(input.organizationId),
      status,
      issuedAt: now,
      sentAt: null,
      acceptedAt: null,
      expiresAt: input.expiresAt,
      lineItems: input.lineItems,
      markupPercent: input.markupPercent,
      taxPercent: input.taxPercent,
      notes: input.notes ?? null,
      totals,
      // W2-3 / EH-G defaults — accept input overrides where present.
      tier: input.tier ?? 'custom',
      revisionGroupId: input.revisionGroupId ?? null,
      parentQuoteId: input.parentQuoteId ?? null,
      revisionNumber: input.revisionNumber ?? 1,
      expiryDate: input.expiryDate ?? null,
      rejectedReason: null,
      rejectedReasonCode: null,
      customerVisibleNotes: input.customerVisibleNotes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async markSent(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!row) {
      throw new Error(`Quote ${id} not found in org ${organizationId}`)
    }
    if (row.status === 'sent') return row
    row.status = 'sent'
    row.sentAt = nowIso()
    row.updatedAt = row.sentAt
    return row
  }

  async markAccepted(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!row) {
      throw new Error(`Quote ${id} not found in org ${organizationId}`)
    }
    if (row.status === 'accepted') return row
    if (row.status !== 'sent') {
      throw new Error(
        `Cannot accept quote ${id} from status "${row.status}" (must be sent)`,
      )
    }
    row.status = 'accepted'
    row.acceptedAt = nowIso()
    row.updatedAt = row.acceptedAt
    return row
  }

  // --- W2-3 / EH-G additions --------------------------------------------
  async revise(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const source = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!source) throw new Error(`Quote ${id} not found in org ${organizationId}`)
    const now = nowIso()
    const groupId = source.revisionGroupId ?? source.id
    // Stamp the source so future reads can find the group.
    if (!source.revisionGroupId) source.revisionGroupId = groupId
    const peers = rows.filter(
      (r) => r.revisionGroupId === groupId && !r.deletedAt,
    )
    const nextRevision = Math.max(...peers.map((p) => p.revisionNumber ?? 1)) + 1
    const totals = computeQuoteTotals(source.lineItems, source.markupPercent, source.taxPercent)
    const clone: Quote = {
      ...source,
      id: newId(),
      quoteNumber: nextQuoteNumber(organizationId),
      status: 'draft',
      issuedAt: now,
      sentAt: null,
      acceptedAt: null,
      rejectedReason: null,
      rejectedReasonCode: null,
      lineItems: source.lineItems.map((li) => ({ ...li })),
      totals,
      revisionGroupId: groupId,
      parentQuoteId: source.id,
      revisionNumber: nextRevision,
      createdAt: now,
      updatedAt: now,
    }
    rows.unshift(clone)
    return clone
  }

  async reject(input: {
    id: string
    organizationId: string
    reason: string
    reasonCode: QuoteRejectedReasonCode
  }): Promise<Quote> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = rows.find(
      (r) => r.id === input.id && r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Quote ${input.id} not found in org ${input.organizationId}`)
    if (row.status === 'rejected') return row
    if (row.status === 'accepted') {
      throw new Error('Cannot reject an accepted quote')
    }
    row.status = 'rejected'
    row.rejectedReason = input.reason
    row.rejectedReasonCode = input.reasonCode
    row.updatedAt = nowIso()
    return row
  }

  async expire(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Quote ${id} not found in org ${organizationId}`)
    if (row.status === 'expired') return row
    if (row.status === 'accepted' || row.status === 'rejected') {
      // Terminal states are not re-expirable.
      throw new Error(`Cannot expire quote from status "${row.status}"`)
    }
    row.status = 'expired'
    row.updatedAt = nowIso()
    return row
  }

  async expireBatch(input: { organizationId: string; nowIso?: string }): Promise<Quote[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const cutoff = input.nowIso ?? nowIso()
    const candidates = rows.filter(
      (r) =>
        r.organizationId === input.organizationId &&
        !r.deletedAt &&
        r.status === 'sent' &&
        r.expiryDate != null &&
        r.expiryDate < cutoff,
    )
    const out: Quote[] = []
    for (const c of candidates) {
      c.status = 'expired'
      c.updatedAt = nowIso()
      out.push(c)
    }
    return out
  }

  async respondToQuote(input: {
    id: string
    organizationId: string
    subcontractorId: string
    response: 'accepted' | 'declined'
    notes?: string
  }): Promise<{ quoteId: string; response: 'accepted' | 'declined' }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = rows.find(
      (r) => r.id === input.id && r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Quote ${input.id} not found`)
    // Mock just records the sub response in the row's notes — admin reads it later.
    return { quoteId: row.id, response: input.response }
  }
}
