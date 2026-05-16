/**
 * server/services/property-photo.real.ts — RealPropertyPhotoService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Stub upload seam — the contract URL accepts a data URL OR a
 *     `local://photos/<uuid>` placeholder. W3-1 swaps the entry point
 *     for a sealed-secret S3/R2 signed-URL flow without changing the
 *     contract shape. See TODO at `create()`.
 *   - `reorder` follows the same pattern as building section reorder:
 *     caller submits every active photo id of the property in the
 *     desired order; service writes back sort_order = index in one
 *     transaction.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type {
  IPropertyPhotoService,
  PropertyPhoto,
  PropertyPhotoCreateInput,
  PropertyPhotoUpdateInput,
} from '../../shared/contracts/property-photo'
import { getDb } from '../db/client'
import { propertyPhotos } from '../db/schema/property_photos'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbPropertyPhotoToContract } from './_row-mappers'

export class RealPropertyPhotoService implements IPropertyPhotoService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyPhotos)
      .where(
        and(eq(propertyPhotos.organizationId, organizationId), sql`${propertyPhotos.deletedAt} IS NULL`),
      )
      .orderBy(asc(propertyPhotos.sortOrder), asc(propertyPhotos.createdAt))
    return rows.map(dbPropertyPhotoToContract)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyPhotos)
      .where(
        and(
          eq(propertyPhotos.organizationId, organizationId),
          eq(propertyPhotos.propertyId, propertyId),
          sql`${propertyPhotos.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(propertyPhotos.sortOrder), asc(propertyPhotos.createdAt))
    return rows.map(dbPropertyPhotoToContract)
  }

  async listForBuilding(buildingId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyPhotos)
      .where(
        and(
          eq(propertyPhotos.organizationId, organizationId),
          eq(propertyPhotos.buildingId, buildingId),
          sql`${propertyPhotos.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(propertyPhotos.sortOrder))
    return rows.map(dbPropertyPhotoToContract)
  }

  async listForSection(sectionId: string, organizationId: string): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyPhotos)
      .where(
        and(
          eq(propertyPhotos.organizationId, organizationId),
          eq(propertyPhotos.sectionId, sectionId),
          sql`${propertyPhotos.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(propertyPhotos.sortOrder))
    return rows.map(dbPropertyPhotoToContract)
  }

  async get(id: string, organizationId: string): Promise<PropertyPhoto | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(propertyPhotos)
      .where(
        and(
          eq(propertyPhotos.id, id),
          eq(propertyPhotos.organizationId, organizationId),
          sql`${propertyPhotos.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? dbPropertyPhotoToContract(row) : null
  }

  // TODO(W3-1): swap for sealed-secret S3/R2 signed-URL upload.
  async create(input: PropertyPhotoCreateInput): Promise<PropertyPhoto> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(propertyPhotos)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          buildingId: input.buildingId ?? null,
          sectionId: input.sectionId ?? null,
          url: input.url,
          thumbnailUrl: input.thumbnailUrl ?? null,
          caption: input.caption ?? null,
          takenAt: input.takenAt ? new Date(input.takenAt) : null,
          uploadedByUserId: input.uploadedByUserId ?? this.actorUserId(),
          sortOrder: input.sortOrder ?? 0,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'property_photo',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { propertyId: row!.propertyId, caption: row!.caption },
      })
      return dbPropertyPhotoToContract(row!)
    })
  }

  async update(input: PropertyPhotoUpdateInput): Promise<PropertyPhoto> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(propertyPhotos)
        .where(and(eq(propertyPhotos.id, input.id), eq(propertyPhotos.organizationId, input.organizationId)))
        .limit(1)
      if (!before || before.deletedAt) throw new Error('Photo not found')
      const patch: Partial<typeof propertyPhotos.$inferInsert> = { updatedAt: new Date() }
      if (input.buildingId !== undefined) patch.buildingId = input.buildingId ?? null
      if (input.sectionId !== undefined) patch.sectionId = input.sectionId ?? null
      if (input.caption !== undefined) patch.caption = input.caption ?? null
      if (input.thumbnailUrl !== undefined) patch.thumbnailUrl = input.thumbnailUrl ?? null
      if (input.takenAt !== undefined) patch.takenAt = input.takenAt ? new Date(input.takenAt) : null
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      const [after] = await tx
        .update(propertyPhotos)
        .set(patch)
        .where(and(eq(propertyPhotos.id, input.id), eq(propertyPhotos.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'property_photo',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { caption: before.caption },
        after: { caption: after!.caption },
      })
      return dbPropertyPhotoToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(propertyPhotos)
        .where(and(eq(propertyPhotos.id, id), eq(propertyPhotos.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Photo not found')
      const now = new Date()
      await tx
        .update(propertyPhotos)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(propertyPhotos.id, id), eq(propertyPhotos.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'property_photo',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { caption: before.caption },
      })
    })
  }

  async reorder(
    propertyId: string,
    orderedIds: string[],
    organizationId: string,
  ): Promise<PropertyPhoto[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const liveRows = await tx
        .select()
        .from(propertyPhotos)
        .where(
          and(
            eq(propertyPhotos.organizationId, organizationId),
            eq(propertyPhotos.propertyId, propertyId),
            sql`${propertyPhotos.deletedAt} IS NULL`,
          ),
        )
      const liveIds = liveRows.map(r => r.id)
      if (
        liveIds.length !== orderedIds.length ||
        !liveIds.every(id => orderedIds.includes(id))
      ) {
        throw new Error('reorder: orderedIds must enumerate every active photo of the property')
      }
      const now = new Date()
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(propertyPhotos)
          .set({ sortOrder: i, updatedAt: now })
          .where(
            and(
              eq(propertyPhotos.id, orderedIds[i]!),
              eq(propertyPhotos.organizationId, organizationId),
            ),
          )
      }
      await audit.record({
        organizationId,
        entityType: 'property',
        entityId: propertyId,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: { reorderedPhotos: orderedIds.length },
      })
      const reordered = await tx
        .select()
        .from(propertyPhotos)
        .where(
          and(
            eq(propertyPhotos.organizationId, organizationId),
            inArray(propertyPhotos.id, orderedIds),
          ),
        )
        .orderBy(asc(propertyPhotos.sortOrder))
      return reordered.map(dbPropertyPhotoToContract)
    })
  }
}
