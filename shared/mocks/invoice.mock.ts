/**
 * shared/mocks/invoice.mock.ts — MockInvoiceService (E8-S1).
 *
 * # Decisions (ADR-0008)
 *   - State in a module-level `rows[]`. Tenant-firewalled (E2-S7) on
 *     every method.
 *   - Seeds three fixture invoices spanning the three persisted statuses
 *     plus one row whose `dueAt` is in the past (so the UI's `overdue`
 *     view has a row to render against on first paint). Tied to the
 *     same SEED_PROPERTY/SEED_WO already used by the work-order seed
 *     so cross-entity navigation lights up.
 *   - `invoiceNumber` is org-scoped `INV-YYYY-NNNN`.
 *   - Skips `InvoiceCreateInputSchema.parse` because the seed ids are
 *     non-RFC4122 (E3-S4 lesson, same as E6-S5/E7-S1/E7-S2).
 *
 * # Decision cast down
 *   - Rejected: making `markPaid` infer the amount from `totals.totalCents`
 *     by default. Pretty much always the right answer, but Drew explicitly
 *     wants the option to record partial payments under a single invoice
 *     row. Caller passes the amount (defaults to total).
 *   - Rejected: persisting `overdue`. Derived in UI via `deriveInvoiceView`.
 */
import type {
  IInvoiceService,
  Invoice,
  InvoiceCreateInput,
  InvoiceListInput,
  InvoiceListOutput,
  InvoiceLineItem,
} from '../contracts/invoice'
import type { QuoteLineItem } from '../contracts/quote'
import { computeQuoteTotals } from '../utils/money'
import { assertSameTenant, type TenantResolver } from './tenant'
import { FIXTURE_INVOICES } from './fixtures'

const rows: Invoice[] = [...FIXTURE_INVOICES]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function nextInvoiceNumber(organizationId: string): string {
  const year = new Date().getUTCFullYear()
  const prefix = `INV-${year}-`
  const seq =
    rows.filter(
      (r) => r.organizationId === organizationId && r.invoiceNumber.startsWith(prefix),
    ).length + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

/** Reuse the quote totals helper \u2014 same line-item shape minus sourceField. */
function totalsFor(items: ReadonlyArray<InvoiceLineItem>, markupPercent: number, taxPercent: number) {
  const compatible: QuoteLineItem[] = items.map((li) => ({
    id: li.id,
    kind: li.kind,
    description: li.description,
    quantity: li.quantity,
    unitCostCents: li.unitCostCents,
    sourceField: '',
  }))
  return computeQuoteTotals(compatible, markupPercent, taxPercent)
}

export class MockInvoiceService implements IInvoiceService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: InvoiceListInput): Promise<InvoiceListOutput> {
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

  async get(id: string, organizationId: string): Promise<Invoice | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    return row ?? null
  }

  async create(input: InvoiceCreateInput): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const totals = totalsFor(input.lineItems, input.markupPercent, input.taxPercent)
    const row: Invoice = {
      ...input,
      id: newId(),
      invoiceNumber: nextInvoiceNumber(input.organizationId),
      status: 'draft',
      issuedAt: null,
      sentAt: null,
      paidAt: null,
      paidAmountCents: 0,
      totals,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async markSent(id: string, organizationId: string): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    const idx = rows.findIndex(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (idx < 0) throw new Error('Invoice not found')
    const current = rows[idx]!
    if (current.status === 'sent' || current.status === 'paid') return current
    const now = nowIso()
    const updated: Invoice = {
      ...current,
      status: 'sent',
      issuedAt: current.issuedAt ?? now,
      sentAt: now,
      updatedAt: now,
    }
    rows[idx] = updated
    return updated
  }

  async markPaid(
    id: string,
    organizationId: string,
    paidAmountCents?: number,
  ): Promise<Invoice> {
    assertSameTenant(this.tenantResolver, organizationId)
    const idx = rows.findIndex(
      (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
    )
    if (idx < 0) throw new Error('Invoice not found')
    const current = rows[idx]!
    if (current.status === 'draft') {
      throw new Error('Cannot mark a draft invoice paid; mark it sent first.')
    }
    if (current.status === 'paid') return current
    const now = nowIso()
    const updated: Invoice = {
      ...current,
      status: 'paid',
      paidAt: now,
      paidAmountCents: paidAmountCents ?? current.totals.totalCents,
      updatedAt: now,
    }
    rows[idx] = updated
    return updated
  }
}

export function __resetMockInvoicesForTests(): void {
  rows.splice(0, rows.length, ...FIXTURE_INVOICES)
}
