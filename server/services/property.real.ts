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
  PropertyDepth,
  PropertyListInput,
  PropertyListOutput,
  PropertyStatus,
  PropertyUpdateInput,
} from '../../shared/contracts/property'
import { getDb } from '../db/client'
import { properties } from '../db/schema/properties'
import { buildings } from '../db/schema/buildings'
import { buildingSections } from '../db/schema/building_sections'
import { contacts } from '../db/schema/contacts'
import { propertyPhotos } from '../db/schema/property_photos'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import {
  dbBuildingSectionToContract,
  dbBuildingToContract,
  dbContactToContract,
  dbPropertyToContract,
} from './_row-mappers'
import { emit } from '../../shared/events/bus'
import { propertyCreated } from '../../shared/events/catalog'

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
      // W5-3 / ADR-0037: escape LIKE wildcards in user input.
      const q = escapeLikeContains(input.search)
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
    const created = await withAudit(async ({ tx, audit }) => {
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
          // W2-1 / EH-E — new metadata fields (ADR-0018). Numeric column
          // accepts string|number; we pass through the contract number as-is.
          lotSizeAcres: input.lotSizeAcres == null ? null : String(input.lotSizeAcres),
          parcelNumber: input.parcelNumber ?? null,
          yearBuilt: input.yearBuilt ?? null,
          accessNotes: input.accessNotes ?? null,
          gateCode: input.gateCode ?? null,
          specialInstructions: input.specialInstructions ?? null,
          primaryContactId: input.primaryContactId ?? null,
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
    // Post-transaction emit (ADR-0017).
    await emit(propertyCreated, {
      organizationId: created.organizationId,
      entityId: created.id,
      actorUserId: this.actorUserId(),
      timestamp: new Date().toISOString(),
      addressLine1: created.addressLine1,
    })
    return created
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
      // W2-1 / EH-E (ADR-0018) — new metadata fields.
      if (input.lotSizeAcres !== undefined)
        patch.lotSizeAcres = input.lotSizeAcres == null ? null : String(input.lotSizeAcres)
      if (input.parcelNumber !== undefined) patch.parcelNumber = input.parcelNumber ?? null
      if (input.yearBuilt !== undefined) patch.yearBuilt = input.yearBuilt ?? null
      if (input.accessNotes !== undefined) patch.accessNotes = input.accessNotes ?? null
      if (input.gateCode !== undefined) patch.gateCode = input.gateCode ?? null
      if (input.specialInstructions !== undefined) patch.specialInstructions = input.specialInstructions ?? null
      if (input.primaryContactId !== undefined) patch.primaryContactId = input.primaryContactId ?? null

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

  async getWithDepth(propertyId: string, organizationId: string): Promise<PropertyDepth | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const property = await this.get(propertyId, organizationId)
    if (!property) return null

    const [buildingRows, contactRows, photoRows] = await Promise.all([
      db
        .select()
        .from(buildings)
        .where(
          and(
            eq(buildings.organizationId, organizationId),
            eq(buildings.propertyId, propertyId),
            sql`${buildings.deletedAt} IS NULL`,
          ),
        )
        .orderBy(buildings.sortOrder),
      db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.propertyId, propertyId),
            sql`${contacts.deletedAt} IS NULL`,
          ),
        )
        .orderBy(sql`${contacts.isPrimary} DESC`, contacts.sortOrder),
      db
        .select()
        .from(propertyPhotos)
        .where(
          and(
            eq(propertyPhotos.organizationId, organizationId),
            eq(propertyPhotos.propertyId, propertyId),
            sql`${propertyPhotos.deletedAt} IS NULL`,
          ),
        )
        .orderBy(propertyPhotos.sortOrder)
        .limit(1),
    ])

    // Section fetch — one query for ALL sections of all buildings of
    // this property, then group in memory (avoids N+1 round-trips).
    const buildingIds = buildingRows.map(b => b.id)
    const sectionRows = buildingIds.length === 0
      ? []
      : await db
          .select()
          .from(buildingSections)
          .where(
            and(
              eq(buildingSections.organizationId, organizationId),
              sql`${buildingSections.deletedAt} IS NULL`,
              sql`${buildingSections.buildingId} IN (${sql.join(buildingIds.map(id => sql`${id}`), sql`, `)})`,
            ),
          )
          .orderBy(buildingSections.sortOrder)
    const sectionsByBuilding = new Map<string, typeof sectionRows>()
    for (const s of sectionRows) {
      const bucket = sectionsByBuilding.get(s.buildingId) ?? []
      bucket.push(s)
      sectionsByBuilding.set(s.buildingId, bucket)
    }

    return {
      property,
      buildings: buildingRows.map(b => ({
        ...dbBuildingToContract(b),
        sections: (sectionsByBuilding.get(b.id) ?? []).map(dbBuildingSectionToContract),
      })),
      contacts: contactRows.map(dbContactToContract),
      primaryPhotoUrl: photoRows[0]?.url ?? null,
    }
  }
}
