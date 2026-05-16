/**
 * server/services/trade.real.ts — RealTradeService (Wave 1B / EH-H / W1-3).
 *
 * Mirrors RealProgramService.
 */
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import {
  BUILTIN_TRADES,
  type ITradeService,
  type TradeCreateInput,
  type TradeListInput,
  type TradeListOutput,
  type TradeRecord,
  type TradeUpdateInput,
} from '../../shared/contracts/trade'
import { getDb } from '../db/client'
import { trades } from '../db/schema/trades'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: typeof trades.$inferSelect): TradeRecord {
  return {
    id: r.id,
    organizationId: r.organizationId,
    slug: r.slug,
    name: r.name,
    description: r.description,
    color: r.color,
    icon: r.icon,
    sortOrder: r.sortOrder,
    isBuiltin: r.isBuiltin,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealTradeService implements ITradeService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: TradeListInput): Promise<TradeListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conds: SQL[] = [
      eq(trades.organizationId, input.organizationId),
      sql`${trades.deletedAt} IS NULL`,
    ]
    if (!input.includeInactive) conds.push(eq(trades.isActive, true))
    const where = and(...conds)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(trades)
        .where(where)
        .orderBy(asc(trades.sortOrder), asc(trades.name))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(trades).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<TradeRecord | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.id, id),
          eq(trades.organizationId, organizationId),
          sql`${trades.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: TradeCreateInput): Promise<TradeRecord> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      try {
        const [row] = await tx
          .insert(trades)
          .values({
            organizationId: input.organizationId,
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
            color: input.color ?? null,
            icon: input.icon ?? null,
            sortOrder: input.sortOrder ?? 0,
            isBuiltin: false,
            isActive: true,
          })
          .returning()
        await audit.record({
          organizationId: input.organizationId,
          entityType: 'trade',
          entityId: row!.id,
          action: 'create',
          actorUserId: this.actorUserId(),
          after: { name: row!.name, slug: row!.slug },
        })
        return rowToContract(row!)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/duplicate key|unique/i.test(msg)) {
          throw new Error(`Trade slug already exists: ${input.slug}`)
        }
        throw err
      }
    })
  }

  async update(input: TradeUpdateInput): Promise<TradeRecord> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.id, input.id),
            eq(trades.organizationId, input.organizationId),
            sql`${trades.deletedAt} IS NULL`,
          ),
        )
        .limit(1)
      if (!before) throw new Error('Trade not found')
      const patch: Partial<typeof trades.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.description !== undefined) patch.description = input.description ?? null
      if (input.color !== undefined) patch.color = input.color ?? null
      if (input.icon !== undefined) patch.icon = input.icon ?? null
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      if (input.isActive !== undefined) patch.isActive = input.isActive
      const [after] = await tx
        .update(trades)
        .set(patch)
        .where(and(eq(trades.id, input.id), eq(trades.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'trade',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { name: before.name, isActive: before.isActive, sortOrder: before.sortOrder },
        after: { name: after!.name, isActive: after!.isActive, sortOrder: after!.sortOrder },
      })
      return rowToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(trades)
        .where(and(eq(trades.id, id), eq(trades.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Trade not found')
      if (before.isBuiltin) {
        throw new Error('Built-in trades cannot be deleted; deactivate them instead.')
      }
      const now = new Date()
      await tx
        .update(trades)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(trades.id, id), eq(trades.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'trade',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { name: before.name, slug: before.slug },
      })
    })
  }

  async bootstrap(input: { organizationId: string }): Promise<TradeListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const existing = await db
      .select({ slug: trades.slug })
      .from(trades)
      .where(eq(trades.organizationId, input.organizationId))
    const existingSlugs = new Set(existing.map((r) => r.slug))
    const toInsert = BUILTIN_TRADES.filter((d) => !existingSlugs.has(d.slug))
    if (toInsert.length > 0) {
      await db.insert(trades).values(
        toInsert.map((d) => ({
          organizationId: input.organizationId,
          slug: d.slug,
          name: d.name,
          color: d.color,
          sortOrder: d.sortOrder,
          isBuiltin: true,
          isActive: true,
        })),
      )
    }
    return this.list({ organizationId: input.organizationId, page: 1, pageSize: 200 })
  }
}
