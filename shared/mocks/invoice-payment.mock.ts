/**
 * shared/mocks/invoice-payment.mock.ts — MockInvoicePaymentService
 * (W2-3 / EH-G / ADR-0020).
 *
 * # Decisions (ADR-0008)
 *   - Module-level `rows[]` mirrors the pattern across every other
 *     mock service. The invoice mock holds a reference to this
 *     singleton via `factory.ts` so list/sum operations stay
 *     transactional from the UI's point of view (write then re-read
 *     for the new sum).
 *   - Tenant firewall on every method.
 *   - `voidPayment` is a soft-delete (sets `deletedAt`) so the AR
 *     audit trail keeps the original receipt visible.
 *
 * # Decision cast down
 *   - Rejected: emitting an event per ledger insert. Events fire from
 *     the invoice envelope wrapper (invoice.partial_paid / invoice
 *     .marked_paid) — payment-level events would double-fire.
 */
import type {
  IInvoicePaymentService,
  InvoicePayment,
  InvoicePaymentListInput,
  InvoicePaymentListOutput,
  InvoicePaymentRecordInput,
} from '../contracts/invoice-payment'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: InvoicePayment[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockInvoicePaymentService implements IInvoicePaymentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: InvoicePaymentListInput): Promise<InvoicePaymentListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.invoiceId) scoped = scoped.filter((r) => r.invoiceId === input.invoiceId)
    scoped = scoped.slice().sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async listForInvoice(invoiceId: string, organizationId: string): Promise<InvoicePayment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(
        (r) =>
          r.invoiceId === invoiceId &&
          r.organizationId === organizationId &&
          !r.deletedAt,
      )
      .slice()
      .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1))
  }

  async recordPayment(input: InvoicePaymentRecordInput): Promise<InvoicePayment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: InvoicePayment = {
      id: newId(),
      organizationId: input.organizationId,
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      receivedAt: input.receivedAt ?? now,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      recordedByUserId: input.recordedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async voidPayment(id: string, organizationId: string): Promise<InvoicePayment> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Payment ${id} not found in org ${organizationId}`)
    row.deletedAt = nowIso()
    row.updatedAt = row.deletedAt
    return row
  }
}

/** Test-only: clears state between tests. */
export function __resetMockInvoicePaymentsForTests(): void {
  rows.splice(0, rows.length)
}
