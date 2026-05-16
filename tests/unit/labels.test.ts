/**
 * tests/unit/labels.test.ts — invariants for the CMS label registry defaults
 * (EH-B / W1-2 / ADR-0014).
 *
 * Why this test exists:
 *   - `DEFAULT_LABELS` (shared/labels/defaults.ts) is the source of truth
 *     for default user-facing copy. If a developer adds a new status enum
 *     value and forgets to add a default here, the override editor will
 *     hide the new value forever (no row → no override). This test makes
 *     that omission a build failure.
 *   - We also assert every key parses as `<namespace>.<rest>` where the
 *     namespace is one of the enum values from `LabelNamespaceSchema`, so
 *     typos in `defaults.ts` (`statu.property.lead`) fail loudly.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_LABELS } from '~~/shared/labels/defaults'
import { LabelNamespaceSchema } from '~~/shared/contracts/label'
import { PropertyStatusSchema } from '~~/shared/contracts/property'
import { QuoteStatusSchema } from '~~/shared/contracts/quote'
import { WorkOrderStatusSchema, TradeSlotStatusSchema } from '~~/shared/contracts/work-order'
import { InvoiceStatusSchema } from '~~/shared/contracts/invoice'
import { ComplianceDocStatusSchema } from '~~/shared/contracts/compliance'
import { JobStatusSchema } from '~~/shared/contracts/job'

const namespaces = LabelNamespaceSchema.options
  .slice()
  .sort((a, b) => b.length - a.length)

function namespaceOf(flat: string): string | null {
  for (const ns of namespaces) {
    if (flat === ns || flat.startsWith(ns + '.')) return ns
  }
  return null
}

describe('DEFAULT_LABELS', () => {
  it('every key is namespaced under a known LabelNamespace', () => {
    for (const flat of Object.keys(DEFAULT_LABELS)) {
      const ns = namespaceOf(flat)
      expect(ns, `Unknown namespace for "${flat}"`).not.toBeNull()
    }
  })

  it('every value is a non-empty string', () => {
    for (const [k, v] of Object.entries(DEFAULT_LABELS)) {
      expect(v, `Empty default for "${k}"`).toMatch(/\S/)
    }
  })

  it('covers every PropertyStatus enum value', () => {
    for (const s of PropertyStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.property.${s}`], `missing status.property.${s}`).toBeTruthy()
    }
  })

  it('covers every QuoteStatus enum value', () => {
    for (const s of QuoteStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.quote.${s}`], `missing status.quote.${s}`).toBeTruthy()
    }
  })

  it('covers every WorkOrderStatus enum value', () => {
    for (const s of WorkOrderStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.work_order.${s}`], `missing status.work_order.${s}`).toBeTruthy()
    }
  })

  it('covers every TradeSlotStatus enum value', () => {
    for (const s of TradeSlotStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.work_order.slot.${s}`], `missing status.work_order.slot.${s}`).toBeTruthy()
    }
  })

  it('covers every InvoiceStatus enum value', () => {
    for (const s of InvoiceStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.invoice.${s}`], `missing status.invoice.${s}`).toBeTruthy()
    }
  })

  it('covers every ComplianceDocStatus enum value', () => {
    for (const s of ComplianceDocStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.compliance.${s}`], `missing status.compliance.${s}`).toBeTruthy()
    }
  })

  it('covers every JobStatus enum value', () => {
    for (const s of JobStatusSchema.options) {
      expect(DEFAULT_LABELS[`status.job.${s}`], `missing status.job.${s}`).toBeTruthy()
    }
  })
})
