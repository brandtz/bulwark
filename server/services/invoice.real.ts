/**
 * server/services/invoice.real.ts — RealInvoiceService (E11-S11).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit. Totals re-derived server-side via
 *     `computeQuoteTotals` (the helper is shape-compatible — both quote
 *     and invoice line items have unitCostCents + quantity).
 *   - invoiceNumber generated as `INV-YYYY-{seq}`, org-scoped.
 *   - `markPaid` defaults paidAmountCents to the invoice total but
 *     accepts an explicit override for partial pay scenarios (per the
 *     contract decision).
 */
import { and, count, desc, eq, like, sql, type SQL } from 'drizzle-orm'
import type {
  IInvoiceService,
  Invoice,
  InvoiceCreateInput,
  InvoiceListInput,
  InvoiceListOutput,
} from '../../shared/contracts/invoice'
import { computeQuoteTotals } from '../../shared/utils/money'
import { getDb } from '../db/client'
import { invoices } from '../db/schema/invoices'
import type { Invoice as DbInvoice } from '../db/schema/invoices'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbInvoice): Invoice {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    workOrderId: r.workOrderId,
    quoteId: r.quoteId,
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    paidAmountCents: r.paidAmountCents,
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

export class RealInvoiceService implements IInvoiceService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: InvoiceListInput): Promise<InvoiceListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(invoices.organizationId, input.organizationId),
      sql`${invoices.deletedAt} IS NULL`,
    ]
    if (input.propertyId) conditions.push(eq(invoices.propertyId, input.propertyId))
    if (input.status) conditions.push(eq(invoices.status, input.status))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select().from(invoices).where(where).orderBy(desc(invoices.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(invoices).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Invoice | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId), sql`${invoices.deletedAt} IS NULL`))
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: InvoiceCreateInput): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Invoice line items have the same shape (id, quantity, unitCostCents)
    // computeQuoteTotals needs — pass a structural subset.
    const totals = computeQuoteTotals(
      input.lineItems.map((li) => ({ ...li, sourceField: '' })),
      input.markupPercent,
      input.taxPercent,
    )
    const invoiceNumber = await this.nextInvoiceNumber(input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(invoices)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          workOrderId: input.workOrderId,
          quoteId: input.quoteId,
          invoiceNumber,
          status: 'draft',
          issuedAt: new Date(),
          sentAt: null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          paidAt: null,
          paidAmountCents: 0,
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
        entityType: 'invoice',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { invoiceNumber, totalCents: totals.totalCents, status: 'draft' },
      })
      return rowToContract(row!)
    })
  }

  async markSent(id: string, organizationId: string): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      if (before.status === 'sent' || before.status === 'paid') return rowToContract(before)
      const [after] = await tx
        .update(invoices)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'invoice',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'sent' },
      })
      return rowToContract(after!)
    })
  }

  async markPaid(id: string, organizationId: string, paidAmountCents?: number): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      if (before.status === 'draft') throw new Error('Invoice must be sent before it can be paid')
      const amount = paidAmountCents ?? before.totalCents
      if (before.status === 'paid') return rowToContract(before)
      const [after] = await tx
        .update(invoices)
        .set({ status: 'paid', paidAt: new Date(), paidAmountCents: amount, updatedAt: new Date() })
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'invoice',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'paid', paidAmountCents: amount },
      })
      return rowToContract(after!)
    })
  }

  private async nextInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getUTCFullYear()
    const prefix = `INV-${year}-`
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), like(invoices.invoiceNumber, `${prefix}%`)))
    const seq = Number(row?.n ?? 0) + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }
}
