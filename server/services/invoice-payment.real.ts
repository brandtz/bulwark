/**
 * server/services/invoice-payment.real.ts — RealInvoicePaymentService
 * (W2-3 / EH-G / ADR-0020).
 *
 * # Decisions (ADR-0008)
 *   - Same tenant firewall + audit pattern as every other real service.
 *   - `voidPayment` is a soft-delete (`deletedAt = now`). The ledger is
 *     append-only by policy; we never `DELETE` rows so the AR audit
 *     trail remains complete.
 *   - Reads sort by `received_at ASC` for `listForInvoice` (chronological
 *     bottom-up reading is how AR clerks expect to scan the ledger)
 *     and `DESC` for `list` (newest-first list view).
 */
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  IInvoicePaymentService,
  InvoicePayment,
  InvoicePaymentListInput,
  InvoicePaymentListOutput,
  InvoicePaymentMethod,
  InvoicePaymentRecordInput,
} from '../../shared/contracts/invoice-payment'
import { getDb } from '../db/client'
import { invoicePayments } from '../db/schema/invoice_payments'
import type { InvoicePaymentRow } from '../db/schema/invoice_payments'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: InvoicePaymentRow): InvoicePayment {
  return {
    id: r.id,
    organizationId: r.organizationId,
    invoiceId: r.invoiceId,
    amountCents: r.amountCents,
    receivedAt: r.receivedAt.toISOString(),
    method: r.method as InvoicePaymentMethod,
    reference: r.reference,
    notes: r.notes,
    recordedByUserId: r.recordedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealInvoicePaymentService implements IInvoicePaymentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: InvoicePaymentListInput): Promise<InvoicePaymentListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conds: SQL[] = [
      eq(invoicePayments.organizationId, input.organizationId),
      sql`${invoicePayments.deletedAt} IS NULL`,
    ]
    if (input.invoiceId) conds.push(eq(invoicePayments.invoiceId, input.invoiceId))
    const where = and(...conds)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(invoicePayments)
        .where(where)
        .orderBy(desc(invoicePayments.receivedAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(invoicePayments)
        .where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async listForInvoice(invoiceId: string, organizationId: string): Promise<InvoicePayment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, organizationId),
          eq(invoicePayments.invoiceId, invoiceId),
          sql`${invoicePayments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(invoicePayments.receivedAt))
    return rows.map(rowToContract)
  }

  async recordPayment(input: InvoicePaymentRecordInput): Promise<InvoicePayment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(invoicePayments)
        .values({
          organizationId: input.organizationId,
          invoiceId: input.invoiceId,
          amountCents: input.amountCents,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          recordedByUserId: input.recordedByUserId ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'invoice_payment',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? input.recordedByUserId ?? null,
        after: {
          invoiceId: input.invoiceId,
          amountCents: input.amountCents,
          method: input.method,
        },
      })
      return rowToContract(row!)
    })
  }

  async voidPayment(id: string, organizationId: string): Promise<InvoicePayment> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .update(invoicePayments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(invoicePayments.id, id),
            eq(invoicePayments.organizationId, organizationId),
          ),
        )
        .returning()
      if (!row) throw new Error(`Payment ${id} not found`)
      await audit.record({
        organizationId,
        entityType: 'invoice_payment',
        entityId: id,
        action: 'delete',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'void_payment' },
      })
      return rowToContract(row)
    })
  }
}
