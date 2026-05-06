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
} from '../../shared/contracts/quote'
import { computeQuoteTotals } from '../../shared/utils/money'
import { getDb } from '../db/client'
import { quotes } from '../db/schema/quotes'
import type { Quote as DbQuote } from '../db/schema/quotes'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

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
    return await this.transition(id, organizationId, 'sent', { sentAt: new Date() })
  }

  async markAccepted(id: string, organizationId: string): Promise<Quote> {
    assertSameTenant(this.tenantResolver, organizationId)
    // Pre-flight: a draft cannot be accepted.
    const current = await this.get(id, organizationId)
    if (!current) throw new Error('Quote not found')
    if (current.status === 'draft') throw new Error('Quote must be sent before it can be accepted')
    return await this.transition(id, organizationId, 'accepted', { acceptedAt: new Date() })
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
    const year = new Date().getUTCFullYear()
    const prefix = `Q-${year}-`
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(quotes)
      .where(and(eq(quotes.organizationId, organizationId), like(quotes.quoteNumber, `${prefix}%`)))
    const seq = Number(row?.n ?? 0) + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }
}
