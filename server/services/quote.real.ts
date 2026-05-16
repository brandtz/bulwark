/**
 * server/services/quote.real.ts — RealQuoteService (E11-S7).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit pattern.
 *   - Totals are recomputed server-side via `computeQuoteTotals` so a
 *     tampered client cannot lie about totalCents — the row's `totals`
 *     and mirror `total_cents` are always deterministically derived from
 *     `lineItems + markupPercent + taxPercent` server-side.
 *   - `quoteNumber` generated as `Q-YYYY-{seq}`. Sequence is org-scoped
 *     and queried via `COUNT(*) WHERE quote_number LIKE 'Q-YYYY-%'`. A
 *     race between two concurrent creates could theoretically produce
 *     duplicate numbers; we accept that for v1 because (a) volumes are
 *     low, (b) duplicates are visible (unique constraint TODO), and (c)
 *     the alternative — a per-org sequence table — is over-engineering.
 *   - `markSent` and `markAccepted` are idempotent: re-call returns the
 *     existing row unchanged. `markAccepted` only allows draft→ never-
 *     mind, must be `sent` first per the contract decision.
 */
import { and, count, desc, eq, like, sql, type SQL } from 'drizzle-orm'
import type {
  IQuoteService,
  Quote,
  QuoteCreateInput,
  QuoteListInput,
  QuoteListOutput,
  QuoteRejectedReasonCode,
} from '../../shared/contracts/quote'
import { computeQuoteTotals } from '../../shared/utils/money'
import { buildLikePatternForYear, formatSequentialNumber } from '../../shared/utils/numbering'
import { RealOrgSettingsService } from './org-settings.real'
import { getDb } from '../db/client'
import { quotes } from '../db/schema/quotes'
import type { Quote as DbQuote } from '../db/schema/quotes'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import {
  quoteSent,
  quoteAccepted,
  quoteRejected,
  quoteExpired,
  quoteRevised,
  subQuoteResponded,
} from '../../shared/events/catalog'

function rowToContract(r: DbQuote): Quote {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    assessmentId: r.assessmentId,
    createdById: r.createdById,
    quoteNumber: r.quoteNumber,
    status: r.status,
    issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    lineItems: r.lineItems,
    markupPercent: r.markupPercent,
    taxPercent: r.taxPercent,
    notes: r.notes,
    totals: r.totals,
    tier: r.tier,
    revisionGroupId: r.revisionGroupId,
    parentQuoteId: r.parentQuoteId,
    revisionNumber: r.revisionNumber,
    expiryDate: r.expiryDate ? r.expiryDate.toISOString() : null,
    rejectedReason: r.rejectedReason,
    rejectedReasonCode: (r.rejectedReasonCode as QuoteRejectedReasonCode | null) ?? null,
    customerVisibleNotes: r.customerVisibleNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealQuoteService implements IQuoteService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: QuoteListInput): Promise<QuoteListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(quotes.organizationId, input.organizationId),
      sql`${quotes.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(quotes.propertyId, input.propertyId))
    if (input.status) conditions.push(eq(quotes.status, input.status))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select().from(quotes).where(where).orderBy(desc(quotes.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(quotes).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Quote | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId), sql`${quotes.deletedAt} IS NULL`))
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: QuoteCreateInput): Promise<Quote> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const totals = computeQuoteTotals(input.lineItems, input.markupPercent, input.taxPercent)
    const quoteNumber = await this.nextQuoteNumber(input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(quotes)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          assessmentId: input.assessmentId,
          createdById: input.createdById,
          quoteNumber,
          status: 'draft',
          issuedAt: new Date(),
          sentAt: null,
          acceptedAt: null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          lineItems: input.lineItems,
          markupPercent: input.markupPercent,
          taxPercent: input.taxPercent,
          notes: input.notes ?? null,
          totals,
          totalCents: totals.totalCents,
          tier: input.tier ?? 'custom',
          revisionGroupId: input.revisionGroupId ?? null,
          parentQuoteId: input.parentQuoteId ?? null,
          revisionNumber: input.revisionNumber ?? 1,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          customerVisibleNotes: input.customerVisibleNotes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'quote',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? input.createdById,
        after: { quoteNumber, totalCents: totals.totalCents, status: 'draft' },
      })
      return rowToContract(row!)
    })
  }

  async markSent(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const result = await this.transition(id, organizationId, 'sent', { sentAt: new Date() })
    // Post-transaction emit (ADR-0017): events fire AFTER `withAudit()`
    // commits. A failed transaction triggers no downstream effect.
    await emit(quoteSent, {
      organizationId,
      entityId: result.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.propertyId,
      quoteNumber: result.quoteNumber,
    })
    return result
  }

  async markAccepted(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    // Pre-flight: a draft cannot be accepted.
    const current = await this.get(id, organizationId)
    if (!current) throw new Error('Quote not found')
    if (current.status === 'draft') throw new Error('Quote must be sent before it can be accepted')
    const result = await this.transition(id, organizationId, 'accepted', { acceptedAt: new Date() })
    await emit(quoteAccepted, {
      organizationId,
      entityId: result.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.propertyId,
      quoteNumber: result.quoteNumber,
    })
    return result
  }

  async revise(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const source = await this.get(id, organizationId)
    if (!source) throw new Error('Quote not found')
    const groupId = source.revisionGroupId ?? source.id
    // Find the max revisionNumber in the group so we don't collide on re-revising.
    const db = getDb()
    const [maxRow] = await db
      .select({ maxRev: sql<number>`COALESCE(MAX(revision_number), 1)` })
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, organizationId),
          sql`(${quotes.revisionGroupId} = ${groupId} OR ${quotes.id} = ${groupId})`,
        ),
      )
    const nextRev = Number(maxRow?.maxRev ?? 1) + 1
    const quoteNumber = await this.nextQuoteNumber(organizationId)
    const totals = computeQuoteTotals(source.lineItems, source.markupPercent, source.taxPercent)
    const created = await withAudit(async ({ tx, audit }) => {
      // Backfill parent's revisionGroupId if it's still null (first revise).
      if (!source.revisionGroupId) {
        await tx
          .update(quotes)
          .set({ revisionGroupId: groupId, updatedAt: new Date() })
          .where(and(eq(quotes.id, source.id), eq(quotes.organizationId, organizationId)))
      }
      const [row] = await tx
        .insert(quotes)
        .values({
          organizationId,
          propertyId: source.propertyId,
          assessmentId: source.assessmentId,
          createdById: this.tenantResolver?.()?.userId ?? source.createdById,
          quoteNumber,
          status: 'draft',
          issuedAt: new Date(),
          sentAt: null,
          acceptedAt: null,
          expiresAt: source.expiresAt ? new Date(source.expiresAt) : null,
          lineItems: source.lineItems,
          markupPercent: source.markupPercent,
          taxPercent: source.taxPercent,
          notes: source.notes,
          totals,
          totalCents: totals.totalCents,
          tier: source.tier ?? 'custom',
          revisionGroupId: groupId,
          parentQuoteId: source.id,
          revisionNumber: nextRev,
          expiryDate: source.expiryDate ? new Date(source.expiryDate) : null,
          customerVisibleNotes: source.customerVisibleNotes,
        })
        .returning()
      await audit.record({
        organizationId,
        entityType: 'quote',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? source.createdById,
        metadata: { kind: 'revise', parentQuoteId: source.id, revisionNumber: nextRev },
      })
      return rowToContract(row!)
    })
    await emit(quoteRevised, {
      organizationId,
      entityId: created.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: created.propertyId,
      quoteNumber: created.quoteNumber,
      parentQuoteId: source.id,
      revisionNumber: nextRev,
    })
    return created
  }

  async reject(input: {
    id: string
    organizationId: string
    reason: string
    reasonCode: QuoteRejectedReasonCode
  }): Promise<Quote> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, input.id), eq(quotes.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Quote not found')
      if (before.status === 'rejected') return rowToContract(before)
      if (before.status === 'accepted') throw new Error('Cannot reject an accepted quote')
      const [after] = await tx
        .update(quotes)
        .set({
          status: 'rejected',
          rejectedReason: input.reason,
          rejectedReasonCode: input.reasonCode,
          updatedAt: new Date(),
        })
        .where(and(eq(quotes.id, input.id), eq(quotes.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'quote',
        entityId: input.id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'rejected', reasonCode: input.reasonCode },
      })
      return rowToContract(after!)
    })
    await emit(quoteRejected, {
      organizationId: input.organizationId,
      entityId: result.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.propertyId,
      quoteNumber: result.quoteNumber,
      reason: input.reason,
      reasonCode: input.reasonCode,
    })
    return result
  }

  async expire(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Quote not found')
      if (before.status === 'expired') return rowToContract(before)
      const [after] = await tx
        .update(quotes)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'quote',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'expired' },
      })
      return rowToContract(after!)
    })
    await emit(quoteExpired, {
      organizationId,
      entityId: result.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.propertyId,
      quoteNumber: result.quoteNumber,
    })
    return result
  }

  async expireBatch(input: { organizationId: string; nowIso?: string }): Promise<Quote[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const cutoff = input.nowIso ? new Date(input.nowIso) : new Date()
    const db = getDb()
    const candidates = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, input.organizationId),
          eq(quotes.status, 'sent'),
          sql`${quotes.expiryDate} IS NOT NULL`,
          sql`${quotes.expiryDate} < ${cutoff.toISOString()}`,
          sql`${quotes.deletedAt} IS NULL`,
        ),
      )
    const out: Quote[] = []
    for (const c of candidates) {
      const expired = await this.expire(c.id, input.organizationId)
      out.push(expired)
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
    const db = getDb()
    const [row] = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.id, input.id),
          eq(quotes.organizationId, input.organizationId),
          sql`${quotes.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    if (!row) throw new Error('Quote not found')
    await withAudit(async ({ audit }) => {
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'quote',
        entityId: input.id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: {
          kind: 'sub_responded',
          subcontractorId: input.subcontractorId,
          response: input.response,
          notes: input.notes ?? null,
        },
      })
    })
    await emit(subQuoteResponded, {
      organizationId: input.organizationId,
      entityId: input.id,
      actorUserId: this.tenantResolver?.()?.userId ?? null,
      timestamp: new Date().toISOString(),
      quoteId: input.id,
      subcontractorId: input.subcontractorId,
      response: input.response,
      notes: input.notes,
    })
    return { quoteId: input.id, response: input.response }
  }

  // --- internals ----------------------------------------------------------
  private async transition(
    id: string,
    organizationId: string,
    target: 'sent' | 'accepted',
    extras: Record<string, Date>,
  ): Promise<Quote> {
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Quote not found')
      // Idempotent.
      if (before.status === target) return rowToContract(before)
      const [after] = await tx
        .update(quotes)
        .set({ status: target, ...extras, updatedAt: new Date() })
        .where(and(eq(quotes.id, id), eq(quotes.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'quote',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: target },
      })
      return rowToContract(after!)
    })
  }

  private async nextQuoteNumber(organizationId: string): Promise<string> {
    // EH-H / W1-3: format is tenant-configurable via org_settings. Falls back
    // to the platform default (`Q-{year}-{seq:04}`) when settings absent.
    const settings = await new RealOrgSettingsService(this.tenantResolver).get(organizationId)
    const format = settings.quoteNumberFormat
    const year = new Date().getUTCFullYear()
    const likePattern = buildLikePatternForYear(format, year)
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(quotes)
      .where(and(eq(quotes.organizationId, organizationId), like(quotes.quoteNumber, likePattern)))
    const seq = Number(row?.n ?? 0) + 1
    return formatSequentialNumber({ format, year, seq })
  }
}
