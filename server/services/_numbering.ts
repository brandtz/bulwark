/**
 * server/services/_numbering.ts — race-safe quote / invoice / work-order
 * numbers (WP-L06 S2, epic L06 key decisions).
 *
 * - `allocateDocumentNumber` runs INSIDE the create transaction: it advances
 *   the org's counter row with `UPDATE ... RETURNING`, so concurrent creates in
 *   one org serialize on that row lock until the insert commits (the old
 *   `COUNT(*)+1` read raced and could hand two creates the same number).
 * - The first allocation of a period seeds the counter from the existing
 *   `COUNT(*) ... LIKE` so numbering continues where pre-L06 data left off.
 * - A candidate that already exists (legacy gaps, a format change that
 *   collides) is skipped, never reused.
 * - Backstop: per-org UNIQUE indexes on the number columns. `withNumberRetry`
 *   re-runs a create once on that specific violation.
 */
import { and, count, eq, like, sql } from 'drizzle-orm'
import { invoices } from '../db/schema/invoices'
import { orgNumberCounters } from '../db/schema/org_number_counters'
import { quotes } from '../db/schema/quotes'
import { workOrders } from '../db/schema/work_orders'
import { buildLikePatternForYear, formatSequentialNumber } from '../../shared/utils/numbering'
import type { AuditCtx } from './_tx'

type Tx = AuditCtx['tx']

export type NumberedEntity = 'quote' | 'invoice' | 'work_order'

const TARGETS = {
  quote: { table: quotes, org: quotes.organizationId, number: quotes.quoteNumber },
  invoice: { table: invoices, org: invoices.organizationId, number: invoices.invoiceNumber },
  work_order: { table: workOrders, org: workOrders.organizationId, number: workOrders.workOrderNumber },
} as const

const UNIQUE_CONSTRAINTS = new Set(['quotes_org_number_unique', 'invoices_org_number_unique', 'work_orders_org_number_unique'])

/** A number series resets yearly only when the format shows the year. */
export function numberPeriod(format: string, now: Date): number {
  return format.includes('{year}') ? now.getUTCFullYear() : 0
}

export interface AllocateInput {
  organizationId: string
  entity: NumberedEntity
  format: string
  now?: Date
}

export async function allocateDocumentNumber(tx: Tx, input: AllocateInput): Promise<string> {
  const now = input.now ?? new Date()
  const year = now.getUTCFullYear()
  const period = numberPeriod(input.format, now)
  const target = TARGETS[input.entity]
  const counterKey = and(
    eq(orgNumberCounters.organizationId, input.organizationId),
    eq(orgNumberCounters.entity, input.entity),
    eq(orgNumberCounters.period, period),
  )

  const [existing] = await tx.select({ seq: orgNumberCounters.lastSeq }).from(orgNumberCounters).where(counterKey).limit(1)
  if (!existing) {
    const [seed] = await tx
      .select({ n: count() })
      .from(target.table)
      .where(and(eq(target.org, input.organizationId), like(target.number, buildLikePatternForYear(input.format, year))))
    await tx
      .insert(orgNumberCounters)
      .values({ organizationId: input.organizationId, entity: input.entity, period, lastSeq: Number(seed?.n ?? 0) })
      .onConflictDoNothing()
  }

  // Bounded: each pass consumes one sequence value; only pre-existing rows can collide.
  for (let pass = 0; pass < 10_000; pass++) {
    const [row] = await tx
      .update(orgNumberCounters)
      .set({ lastSeq: sql`${orgNumberCounters.lastSeq} + 1`, updatedAt: now })
      .where(counterKey)
      .returning({ seq: orgNumberCounters.lastSeq })
    const candidate = formatSequentialNumber({ format: input.format, year, seq: row!.seq })
    const [taken] = await tx
      .select({ one: sql<number>`1` })
      .from(target.table)
      .where(and(eq(target.org, input.organizationId), eq(target.number, candidate)))
      .limit(1)
    if (!taken) return candidate
  }
  throw new Error(`Could not allocate a ${input.entity} number`)
}

/** True when `err` (or its cause, as drizzle wraps driver errors) is a number-uniqueness violation. */
export function isNumberConflict(err: unknown): boolean {
  for (let e = err as { code?: string, constraint_name?: string, constraint?: string, cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === '23505' && UNIQUE_CONSTRAINTS.has(e.constraint_name ?? e.constraint ?? '')) return true
  }
  return false
}

/** Run a numbered create; retry once if the UNIQUE backstop fires. */
export async function withNumberRetry<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create()
  } catch (err) {
    if (!isNumberConflict(err)) throw err
    return await create()
  }
}
