/**
 * server/services/building.real.ts — RealBuildingService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Mirrors the mock: tenant firewall, soft-delete, audit-wrapped
 *     mutations.
 *   - `reorderSections` runs in a single transaction. It validates
 *     `orderedIds` against the active section set BEFORE issuing the
 *     update so a partial run can't corrupt sort_order halfway through.
 *   - Section + building share one Real service to keep the audit
 *     entity_type taxonomy aligned (`building` / `building_section`).
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type {
  Building,
  BuildingCreateInput,
  BuildingSection,
  BuildingSectionCreateInput,
  BuildingSectionUpdateInput,
  BuildingUpdateInput,
  IBuildingService,
} from '../../shared/contracts/building'
import { getDb } from '../db/client'
import { buildings } from '../db/schema/buildings'
import { buildingSections } from '../db/schema/building_sections'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbBuildingToContract, dbBuildingSectionToContract } from './_row-mappers'

export class RealBuildingService implements IBuildingService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(organizationId: string): Promise<Building[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.organizationId, organizationId),
          sql`${buildings.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(buildings.sortOrder), asc(buildings.createdAt))
    return rows.map(dbBuildingToContract)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<Building[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.organizationId, organizationId),
          eq(buildings.propertyId, propertyId),
          sql`${buildings.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(buildings.sortOrder), asc(buildings.createdAt))
    return rows.map(dbBuildingToContract)
  }

  async get(id: string, organizationId: string): Promise<Building | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.id, id),
          eq(buildings.organizationId, organizationId),
          sql`${buildings.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? dbBuildingToContract(row) : null
  }

  async create(input: BuildingCreateInput): Promise<Building> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(buildings)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          name: input.name,
          kind: input.kind ?? 'house',
          yearBuilt: input.yearBuilt ?? null,
          squareFeet: input.squareFeet ?? null,
          stories: input.stories ?? null,
          constructionType: input.constructionType ?? null,
          roofMaterial: input.roofMaterial ?? null,
          sidingMaterial: input.sidingMaterial ?? null,
          notes: input.notes ?? null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'building',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { name: row!.name, kind: row!.kind, propertyId: row!.propertyId },
      })
      return dbBuildingToContract(row!)
    })
  }

  async update(input: BuildingUpdateInput): Promise<Building> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(buildings)
        .where(and(eq(buildings.id, input.id), eq(buildings.organizationId, input.organizationId)))
        .limit(1)
      if (!before || before.deletedAt) throw new Error('Building not found')
      const patch: Partial<typeof buildings.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.kind !== undefined) patch.kind = input.kind
      if (input.yearBuilt !== undefined) patch.yearBuilt = input.yearBuilt ?? null
      if (input.squareFeet !== undefined) patch.squareFeet = input.squareFeet ?? null
      if (input.stories !== undefined) patch.stories = input.stories ?? null
      if (input.constructionType !== undefined) patch.constructionType = input.constructionType ?? null
      if (input.roofMaterial !== undefined) patch.roofMaterial = input.roofMaterial ?? null
      if (input.sidingMaterial !== undefined) patch.sidingMaterial = input.sidingMaterial ?? null
      if (input.notes !== undefined) patch.notes = input.notes ?? null
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      const [after] = await tx
        .update(buildings)
        .set(patch)
        .where(and(eq(buildings.id, input.id), eq(buildings.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'building',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { name: before.name, kind: before.kind },
        after: { name: after!.name, kind: after!.kind },
      })
      return dbBuildingToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(buildings)
        .where(and(eq(buildings.id, id), eq(buildings.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Building not found')
      const now = new Date()
      await tx
        .update(buildings)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(buildings.id, id), eq(buildings.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'building',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { name: before.name },
      })
    })
  }

  async listSections(buildingId: string, organizationId: string): Promise<BuildingSection[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(buildingSections)
      .where(
        and(
          eq(buildingSections.organizationId, organizationId),
          eq(buildingSections.buildingId, buildingId),
          sql`${buildingSections.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(buildingSections.sortOrder), asc(buildingSections.createdAt))
    return rows.map(dbBuildingSectionToContract)
  }

  async createSection(input: BuildingSectionCreateInput): Promise<BuildingSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(buildingSections)
        .values({
          organizationId: input.organizationId,
          buildingId: input.buildingId,
          label: input.label,
          kind: input.kind ?? 'other',
          squareFeet: input.squareFeet ?? null,
          notes: input.notes ?? null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'building_section',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { label: row!.label, kind: row!.kind, buildingId: row!.buildingId },
      })
      return dbBuildingSectionToContract(row!)
    })
  }

  async updateSection(input: BuildingSectionUpdateInput): Promise<BuildingSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(buildingSections)
        .where(
          and(
            eq(buildingSections.id, input.id),
            eq(buildingSections.organizationId, input.organizationId),
          ),
        )
        .limit(1)
      if (!before || before.deletedAt) throw new Error('Section not found')
      const patch: Partial<typeof buildingSections.$inferInsert> = { updatedAt: new Date() }
      if (input.label !== undefined) patch.label = input.label
      if (input.kind !== undefined) patch.kind = input.kind
      if (input.squareFeet !== undefined) patch.squareFeet = input.squareFeet ?? null
      if (input.notes !== undefined) patch.notes = input.notes ?? null
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      const [after] = await tx
        .update(buildingSections)
        .set(patch)
        .where(
          and(
            eq(buildingSections.id, input.id),
            eq(buildingSections.organizationId, input.organizationId),
          ),
        )
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'building_section',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { label: before.label },
        after: { label: after!.label },
      })
      return dbBuildingSectionToContract(after!)
    })
  }

  async softDeleteSection(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(buildingSections)
        .where(and(eq(buildingSections.id, id), eq(buildingSections.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Section not found')
      const now = new Date()
      await tx
        .update(buildingSections)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(buildingSections.id, id), eq(buildingSections.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'building_section',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { label: before.label },
      })
    })
  }

  async reorderSections(
    buildingId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<BuildingSection[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const liveRows = await tx
        .select()
        .from(buildingSections)
        .where(
          and(
            eq(buildingSections.organizationId, organizationId),
            eq(buildingSections.buildingId, buildingId),
            sql`${buildingSections.deletedAt} IS NULL`,
          ),
        )
      const liveIds = liveRows.map(r => r.id)
      if (
        liveIds.length !== orderedIds.length ||
        !liveIds.every(id => orderedIds.includes(id))
      ) {
        throw new Error('reorderSections: orderedIds must enumerate every active section of the building')
      }
      // Single CASE update — one round-trip.
      const now = new Date()
      // Drizzle has no batch-with-position helper; loop is fine for the
      // tiny sizes (sections per building rarely exceed ~20).
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(buildingSections)
          .set({ sortOrder: i, updatedAt: now })
          .where(
            and(
              eq(buildingSections.id, orderedIds[i]!),
              eq(buildingSections.organizationId, organizationId),
            ),
          )
      }
      await audit.record({
        organizationId,
        entityType: 'building',
        entityId: buildingId,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: { reorderedSections: orderedIds.length },
      })
      const reordered = await tx
        .select()
        .from(buildingSections)
        .where(
          and(
            eq(buildingSections.organizationId, organizationId),
            inArray(buildingSections.id, orderedIds),
          ),
        )
        .orderBy(asc(buildingSections.sortOrder))
      return reordered.map(dbBuildingSectionToContract)
    })
  }
}
