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
  InvoiceLineItem,
} from '../../shared/contracts/invoice'
import { INVOICE_TERMS_DAYS } from '../../shared/contracts/invoice'
import { computeQuoteTotals } from '../../shared/utils/money'
import { buildLikePatternForYear, formatSequentialNumber } from '../../shared/utils/numbering'
import { RealOrgSettingsService } from './org-settings.real'
import { RealInvoicePaymentService } from './invoice-payment.real'
import { getDb } from '../db/client'
import { invoices } from '../db/schema/invoices'
import type { Invoice as DbInvoice } from '../db/schema/invoices'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { emit } from '../../shared/events/bus'
import {
  invoiceSent,
  invoiceMarkedPaid,
  invoicePartialPaid,
  invoiceVoided,
} from '../../shared/events/catalog'
import type { InvoicePaymentMethod } from '../../shared/contracts/invoice-payment'

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
    depositRequiredCents: r.depositRequiredCents,
    depositReceivedCents: r.depositReceivedCents,
    retainageBps: r.retainageBps,
    retainageReleasedCents: r.retainageReleasedCents,
    terms: r.terms,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
    voidedReason: r.voidedReason,
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
    // W2-3 / EH-G: derive dueDate from terms if caller didn't provide one.
    let dueDate: Date | null = input.dueDate ? new Date(input.dueDate) : null
    if (!dueDate && input.terms && input.terms !== 'custom') {
      const days = INVOICE_TERMS_DAYS[input.terms]
      dueDate = new Date(Date.now() + days * 86_400_000)
    }
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
          depositRequiredCents: input.depositRequiredCents ?? 0,
          depositReceivedCents: input.depositReceivedCents ?? 0,
          retainageBps: input.retainageBps ?? 0,
          retainageReleasedCents: input.retainageReleasedCents ?? 0,
          terms: input.terms ?? 'net_30',
          dueDate,
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
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      if (before.status === 'sent' || before.status === 'paid') return { row: rowToContract(before), changed: false }
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
      return { row: rowToContract(after!), changed: true }
    })
    if (result.changed) {
      await emit(invoiceSent, {
        organizationId,
        entityId: result.row.id,
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        timestamp: new Date().toISOString(),
        propertyId: result.row.propertyId,
        invoiceNumber: result.row.invoiceNumber,
      })
    }
    return result.row
  }

  async markPaid(id: string, organizationId: string, paidAmountCents?: number): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      if (before.status === 'draft') throw new Error('Invoice must be sent before it can be paid')
      const amount = paidAmountCents ?? before.totalCents
      if (before.status === 'paid') return { row: rowToContract(before), changed: false, amount }
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
      return { row: rowToContract(after!), changed: true, amount }
    })
    if (result.changed) {
      // Post-transaction emit (ADR-0017). Drives property → `paid`
      // transition IFF this was the last unpaid invoice (subscriber
      // enforces the predicate).
      await emit(invoiceMarkedPaid, {
        organizationId,
        entityId: result.row.id,
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        timestamp: new Date().toISOString(),
        propertyId: result.row.propertyId,
        invoiceNumber: result.row.invoiceNumber,
        paidAmountCents: result.amount,
      })
    }
    return result.row
  }

  async recordPayment(input: {
    invoiceId: string
    organizationId: string
    amountCents: number
    method: InvoicePaymentMethod
    reference?: string | null
    notes?: string | null
    receivedAt?: string
    recordedByUserId?: string | null
  }): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // 1) Append the ledger row via the payment service (its own withAudit tx).
    const paymentService = new RealInvoicePaymentService(this.tenantResolver)
    await paymentService.recordPayment({
      organizationId: input.organizationId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      receivedAt: input.receivedAt,
      recordedByUserId: input.recordedByUserId ?? null,
    })
    // 2) Recompute balance: SUM(payments) - totalCents. Then transition.
    const db = getDb()
    const balanceRow = await db.execute<{ paid_sum: number }>(sql`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS paid_sum
      FROM invoice_payments
      WHERE invoice_id = ${input.invoiceId}
        AND organization_id = ${input.organizationId}
        AND deleted_at IS NULL
    `)
    const paidSoFar = Number(
      (balanceRow as unknown as { rows?: { paid_sum: number }[] }).rows?.[0]?.paid_sum ??
        (Array.isArray(balanceRow) ? balanceRow[0]?.paid_sum : 0),
    )
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      const fullyPaid = paidSoFar >= before.totalCents
      const nextStatus: DbInvoice['status'] = fullyPaid
        ? 'paid'
        : paidSoFar > 0
          ? 'partial'
          : before.status
      const [after] = await tx
        .update(invoices)
        .set({
          status: nextStatus,
          paidAmountCents: paidSoFar,
          paidAt: fullyPaid ? new Date() : before.paidAt,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'invoice',
        entityId: input.invoiceId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? input.recordedByUserId ?? null,
        metadata: {
          from: before.status,
          to: nextStatus,
          paidSoFarCents: paidSoFar,
          paymentCents: input.amountCents,
        },
      })
      return {
        row: rowToContract(after!),
        prevStatus: before.status,
        fullyPaid,
        totalCents: before.totalCents,
      }
    })
    const eventBase = {
      organizationId: input.organizationId,
      entityId: result.row.id,
      actorUserId: this.tenantResolver?.()?.userId ?? input.recordedByUserId ?? null,
      timestamp: new Date().toISOString(),
      propertyId: result.row.propertyId,
      invoiceNumber: result.row.invoiceNumber,
    }
    if (result.fullyPaid && result.prevStatus !== 'paid') {
      await emit(invoiceMarkedPaid, { ...eventBase, paidAmountCents: paidSoFar })
    } else if (!result.fullyPaid) {
      await emit(invoicePartialPaid, {
        ...eventBase,
        paidSoFarCents: paidSoFar,
        remainingCents: Math.max(0, result.totalCents - paidSoFar),
      })
    }
    return result.row
  }

  async voidInvoice(input: {
    invoiceId: string
    organizationId: string
    reason: string
  }): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const result = await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      if (before.status === 'voided') return { row: rowToContract(before), changed: false }
      const [after] = await tx
        .update(invoices)
        .set({
          status: 'voided',
          voidedAt: new Date(),
          voidedReason: input.reason,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'invoice',
        entityId: input.invoiceId,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { from: before.status, to: 'voided', reason: input.reason },
      })
      return { row: rowToContract(after!), changed: true }
    })
    if (result.changed) {
      await emit(invoiceVoided, {
        organizationId: input.organizationId,
        entityId: result.row.id,
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        timestamp: new Date().toISOString(),
        propertyId: result.row.propertyId,
        invoiceNumber: result.row.invoiceNumber,
        reason: input.reason,
      })
    }
    return result.row
  }

  /**
   * W2-3 / EH-G internal helper: append a synthetic line item to an
   * invoice (used by RealChangeOrderService.approve via factory hook).
   * Recomputes totals. NOT exposed on IInvoiceService — internal.
   */
  async appendLineItem(invoiceId: string, organizationId: string, line: InvoiceLineItem): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Invoice not found')
      const newLines = [...before.lineItems, line]
      const totals = computeQuoteTotals(
        newLines.map((li) => ({ ...li, sourceField: '' })),
        before.markupPercent,
        before.taxPercent,
      )
      const [after] = await tx
        .update(invoices)
        .set({ lineItems: newLines, totals, totalCents: totals.totalCents, updatedAt: new Date() })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'append_line_item', lineId: line.id, amountCents: line.unitCostCents },
      })
      return rowToContract(after!)
    })
  }

  private async nextInvoiceNumber(organizationId: string): Promise<string> {
    // EH-H / W1-3: tenant-configurable format.
    const settings = await new RealOrgSettingsService(this.tenantResolver).get(organizationId)
    const format = settings.invoiceNumberFormat
    const year = new Date().getUTCFullYear()
    const likePattern = buildLikePatternForYear(format, year)
    const db = getDb()
    const [row] = await db
      .select({ n: count() })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), like(invoices.invoiceNumber, likePattern)))
    const seq = Number(row?.n ?? 0) + 1
    return formatSequentialNumber({ format, year, seq })
  }
}
