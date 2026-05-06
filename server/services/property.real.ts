/**
 * server/services/property.real.ts — RealPropertyService (E11-S5).
 *
 * # Decisions (ADR-0008)
 *   - Every write call funnels through `withAudit({ tx, audit })` so the
 *     domain row + the audit_log row commit/rollback as one unit
 *     (ADR-0002). Reads bypass the helper because they don't mutate.
 *   - Tenant firewall mirrors the mock: each method calls
 *     `assertSameTenant()` BEFORE any DB access. A null resolver
 *     (e.g. unit tests with a hand-rolled service) skips the check.
 *   - Soft delete only — `deletedAt` IS NULL filtered everywhere. Any
 *     hard delete is an admin script, not a service method.
 *   - Search filter is a case-insensitive `ILIKE` against `address_line_1`
 *     and `city`. Cheap, no fulltext index needed for v1 volumes.
 *
 * # Decision cast down
 *   - Returning the raw Drizzle row. Rejected — Drizzle gives `Date`
 *     for timestamp columns; the contract demands ISO strings. Mapper
 *     lives in `_row-mappers.ts`.
 *   - Auditing reads. Rejected — we don't currently have a privacy
 *     story that requires read-side audit; adding it everywhere would
 *     2× the audit volume. If we ever need it (e.g. HIPAA-style logs)
 *     we add it explicitly per-method, not blanket.
 */
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type {
  IPropertyService,
  Property,
  PropertyCreateInput,
  PropertyListInput,
  PropertyListOutput,
  PropertyStatus,
  PropertyUpdateInput,
} from '../../shared/contracts/property'
import { getDb } from '../db/client'
import { properties } from '../db/schema/properties'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbPropertyToContract } from './_row-mappers'

export class RealPropertyService implements IPropertyService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: PropertyListInput): Promise<PropertyListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()

    const conditions: SQL[] = [
      eq(properties.organizationId, input.organizationId),
      sql`${properties.deletedAt} IS NULL`,
    ]
    if (input.status) conditions.push(eq(properties.status, input.status))
    if (input.search) {
      const q = `%${input.search}%`
      const like = or(ilike(properties.addressLine1, q), ilike(properties.city, q))
      if (like) conditions.push(like)
    }
    const whereClause = and(...conditions)!

    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(properties)
        .where(whereClause)
        .orderBy(desc(properties.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(properties)
        .where(whereClause),
    ])
    return {
      rows: rows.map(dbPropertyToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Property | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(properties)
      .where(
        and(
          eq(properties.id, id),
          eq(properties.organizationId, organizationId),
          sql`${properties.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? dbPropertyToContract(row) : null
  }

  async create(input: PropertyCreateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(properties)
        .values({
          organizationId: input.organizationId,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          clientId: input.clientId ?? null,
          status: 'lead',
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'property',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { addressLine1: row!.addressLine1, city: row!.city, status: row!.status },
      })
      return dbPropertyToContract(row!)
    })
  }

  async update(input: PropertyUpdateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(properties)
        .where(and(eq(properties.id, input.id), eq(properties.organizationId, input.organizationId)))
        .limit(1)
      if (!before) throw new Error('Property not found')

      const patch: Partial<typeof properties.$inferInsert> = { updatedAt: new Date() }
      if (input.addressLine1 !== undefined) patch.addressLine1 = input.addressLine1
      if (input.addressLine2 !== undefined) patch.addressLine2 = input.addressLine2
      if (input.city !== undefined) patch.city = input.city
      if (input.state !== undefined) patch.state = input.state
      if (input.postalCode !== undefined) patch.postalCode = input.postalCode
      if (input.clientId !== undefined) patch.clientId = input.clientId
      if (input.notes !== undefined) patch.notes = input.notes

      const [after] = await tx
        .update(properties)
        .set(patch)
        .where(and(eq(properties.id, input.id), eq(properties.organizationId, input.organizationId)))
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'property',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: dbPropertyToContract(before) as unknown as Record<string, unknown>,
        after: dbPropertyToContract(after!) as unknown as Record<string, unknown>,
      })
      return dbPropertyToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Property not found')
      await tx
        .update(properties)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'property',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { status: before.status },
      })
    })
  }

  async updateStatus(id: string, status: PropertyStatus, organizationId: string): Promise<Property> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Property not found')
      const [after] = await tx
        .update(properties)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'property',
        entityId: id,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: { from: before.status, to: status },
      })
      return dbPropertyToContract(after!)
    })
  }

  /** Pulls the active session's user id, if available. */
  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }
}
