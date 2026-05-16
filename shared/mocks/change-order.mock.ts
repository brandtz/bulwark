/**
 * shared/mocks/change-order.mock.ts — MockChangeOrderService
 * (W2-3 / EH-G / ADR-0020).
 *
 * # Decisions (ADR-0008)
 *   - Module-level `rows[]`. Tenant-firewalled.
 *   - At-least-one-of (`workOrderId`, `invoiceId`) is enforced at the
 *     service boundary, not in the Zod schema.
 *   - `approve()` appends a synthetic line item to the linked WO or
 *     invoice. Implementation accepts injected accessors (closures
 *     over the sister mocks) so the apply-on-approve side-effect
 *     stays consistent without circular module deps.
 */
import type {
  ChangeOrder,
  ChangeOrderApproveInput,
  ChangeOrderListInput,
  ChangeOrderListOutput,
  ChangeOrderProposeInput,
  ChangeOrderRejectInput,
  IChangeOrderService,
} from '../contracts/change-order'
import type { Invoice, InvoiceLineItem } from '../contracts/invoice'
import type { WorkOrder } from '../contracts/work-order'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: ChangeOrder[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

/** Side-effect hooks the mock factory injects so `approve` can patch the linked WO/invoice. */
export interface ChangeOrderApplyHooks {
  appendInvoiceLine(invoiceId: string, organizationId: string, line: InvoiceLineItem): Promise<Invoice>
  appendWorkOrderNote(workOrderId: string, organizationId: string, note: string): Promise<WorkOrder>
}

export class MockChangeOrderService implements IChangeOrderService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly hooks?: ChangeOrderApplyHooks,
  ) {}

  async list(input: ChangeOrderListInput): Promise<ChangeOrderListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(
      (r) => r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (input.workOrderId) scoped = scoped.filter((r) => r.workOrderId === input.workOrderId)
    if (input.invoiceId) scoped = scoped.filter((r) => r.invoiceId === input.invoiceId)
    if (input.status) scoped = scoped.filter((r) => r.status === input.status)
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

  async get(id: string, organizationId: string): Promise<ChangeOrder | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    return (
      rows.find(
        (r) => r.id === id && r.organizationId === organizationId && !r.deletedAt,
      ) ?? null
    )
  }

  async propose(input: ChangeOrderProposeInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    if (!input.workOrderId && !input.invoiceId) {
      throw new Error('Change order must attach to a work order or invoice')
    }
    const now = nowIso()
    const row: ChangeOrder = {
      id: newId(),
      organizationId: input.organizationId,
      workOrderId: input.workOrderId,
      invoiceId: input.invoiceId,
      title: input.title,
      description: input.description,
      amountCents: input.amountCents,
      status: 'proposed',
      proposedByUserId: input.proposedByUserId,
      approvedAt: null,
      rejectedAt: null,
      approvedByName: null,
      signatureUrl: null,
      rejectedReason: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async approve(input: ChangeOrderApproveInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = rows.find(
      (r) => r.id === input.id && r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Change order ${input.id} not found`)
    if (row.status === 'approved') return row
    if (row.status === 'rejected') throw new Error('Cannot approve a rejected change order')
    const now = nowIso()
    row.status = 'approved'
    row.approvedAt = now
    row.approvedByName = input.approvedByName
    row.signatureUrl = input.signatureUrl ?? null
    row.updatedAt = now
    // Apply: append a line on the linked invoice or note on the WO.
    if (this.hooks) {
      if (row.invoiceId) {
        await this.hooks.appendInvoiceLine(row.invoiceId, input.organizationId, {
          id: newId(),
          kind: 'other',
          description: `Change order: ${row.title}`,
          quantity: 1,
          unitCostCents: row.amountCents,
        })
      } else if (row.workOrderId) {
        await this.hooks.appendWorkOrderNote(
          row.workOrderId,
          input.organizationId,
          `[CO approved] ${row.title} (${row.amountCents >= 0 ? '+' : ''}${row.amountCents}\u00a2)`,
        )
      }
    }
    return row
  }

  async reject(input: ChangeOrderRejectInput): Promise<ChangeOrder> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = rows.find(
      (r) => r.id === input.id && r.organizationId === input.organizationId && !r.deletedAt,
    )
    if (!row) throw new Error(`Change order ${input.id} not found`)
    if (row.status === 'rejected') return row
    if (row.status === 'approved') throw new Error('Cannot reject an approved change order')
    const now = nowIso()
    row.status = 'rejected'
    row.rejectedAt = now
    row.rejectedReason = input.reason
    row.updatedAt = now
    return row
  }
}

export function __resetMockChangeOrdersForTests(): void {
  rows.splice(0, rows.length)
}
