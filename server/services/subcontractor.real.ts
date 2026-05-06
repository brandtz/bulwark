/**
 * server/services/subcontractor.real.ts — RealSubcontractorService (E11-S8).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit. Contract has no `create()` (subs are seeded
 *     elsewhere in v1); only list/get/update.
 *   - `trades` is a JSONB array; the optional `trade` filter in list()
 *     uses `?` (jsonb contains) via raw SQL since drizzle-orm's helper
 *     for JSONB membership isn't ergonomic for a single value.
 */
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  ISubcontractorService,
  Subcontractor,
  SubcontractorCreateInput,
  SubcontractorListInput,
  SubcontractorListOutput,
  SubcontractorUpdateInput,
} from '../../shared/contracts/subcontractor'
import { getDb } from '../db/client'
import { subcontractors } from '../db/schema/subcontractors'
import type { Subcontractor as DbSub } from '../db/schema/subcontractors'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbSub): Subcontractor {
  return {
    id: r.id,
    organizationId: r.organizationId,
    companyName: r.companyName,
    contactName: r.contactName,
    email: r.email,
    phone: r.phone,
    trades: r.trades,
    licenseNumber: r.licenseNumber,
    licenseExpiresAt: r.licenseExpiresAt ? r.licenseExpiresAt.toISOString() : null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealSubcontractorService implements ISubcontractorService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: SubcontractorListInput): Promise<SubcontractorListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(subcontractors.organizationId, input.organizationId),
      sql`${subcontractors.deletedAt} IS NULL`,
    ]
    if (input.trade) {
      // jsonb @> '["trade_value"]' works on a JSONB string-array.
      conditions.push(sql`${subcontractors.trades} @> ${JSON.stringify([input.trade])}::jsonb`)
    }
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select().from(subcontractors).where(where).orderBy(desc(subcontractors.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(subcontractors).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Subcontractor | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(subcontractors)
      .where(
        and(
          eq(subcontractors.id, id),
          eq(subcontractors.organizationId, organizationId),
          sql`${subcontractors.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: SubcontractorCreateInput): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(subcontractors)
        .values({
          organizationId: input.organizationId,
          companyName: input.companyName,
          contactName: input.contactName,
          email: input.email ?? null,
          phone: input.phone,
          trades: input.trades,
          licenseNumber: input.licenseNumber ?? null,
          licenseExpiresAt: input.licenseExpiresAt ? new Date(input.licenseExpiresAt) : null,
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'subcontractor',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { companyName: row!.companyName, trades: row!.trades },
      })
      return rowToContract(row!)
    })
  }

  async update(id: string, input: SubcontractorUpdateInput, organizationId: string): Promise<Subcontractor> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(subcontractors)
        .where(and(eq(subcontractors.id, id), eq(subcontractors.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Subcontractor not found')

      const patch: Partial<typeof subcontractors.$inferInsert> = { updatedAt: new Date() }
      if (input.companyName !== undefined) patch.companyName = input.companyName
      if (input.contactName !== undefined) patch.contactName = input.contactName
      if (input.email !== undefined) patch.email = input.email
      if (input.phone !== undefined) patch.phone = input.phone
      if (input.trades !== undefined) patch.trades = input.trades
      if (input.licenseNumber !== undefined) patch.licenseNumber = input.licenseNumber
      if (input.licenseExpiresAt !== undefined) {
        patch.licenseExpiresAt = input.licenseExpiresAt ? new Date(input.licenseExpiresAt) : null
      }
      if (input.notes !== undefined) patch.notes = input.notes

      const [after] = await tx
        .update(subcontractors)
        .set(patch)
        .where(and(eq(subcontractors.id, id), eq(subcontractors.organizationId, organizationId)))
        .returning()

      await audit.record({
        organizationId,
        entityType: 'subcontractor',
        entityId: id,
        action: 'update',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        before: { companyName: before.companyName, trades: before.trades },
        after: { companyName: after!.companyName, trades: after!.trades },
      })
      return rowToContract(after!)
    })
  }
}
