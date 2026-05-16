/**
 * server/services/saved-view.real.ts — RealSavedViewService
 * (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - Tenant firewall + `withAudit` for every mutation (per ADR-0002).
 *   - `list` returns the union of the user's own views + shared org
 *     views (`userId IS NULL`).
 *   - `setDefault` clears the flag on siblings of the same scope in
 *     the same transaction so we never end up with two defaults.
 */
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type {
  ISavedViewService,
  SavedView,
  SavedViewCreateInput,
  SavedViewEntityType,
  SavedViewListInput,
  SavedViewUpdateInput,
} from '../../shared/contracts/saved-view'
import { getDb } from '../db/client'
import { savedViews, type SavedViewRow } from '../db/schema/saved_views'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: SavedViewRow): SavedView {
  return {
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    entityType: r.entityType as SavedViewEntityType,
    name: r.name,
    filters: (r.filters ?? {}) as Record<string, unknown>,
    sortBy: r.sortBy,
    sortDir: (r.sortDir as SavedView['sortDir']) ?? null,
    isDefault: r.isDefault,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealSavedViewService implements ISavedViewService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: SavedViewListInput): Promise<SavedView[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(savedViews)
      .where(
        and(
          eq(savedViews.organizationId, input.organizationId),
          eq(savedViews.entityType, input.entityType),
          sql`${savedViews.deletedAt} IS NULL`,
          or(eq(savedViews.userId, input.userId), isNull(savedViews.userId))!,
        ),
      )
    return rows.map(rowToContract)
  }

  async get(id: string, organizationId: string): Promise<SavedView | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(savedViews)
      .where(
        and(
          eq(savedViews.id, id),
          eq(savedViews.organizationId, organizationId),
          sql`${savedViews.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: SavedViewCreateInput): Promise<SavedView> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(savedViews)
        .values({
          organizationId: input.organizationId,
          userId: input.userId,
          entityType: input.entityType,
          name: input.name,
          filters: input.filters ?? {},
          sortBy: input.sortBy ?? null,
          sortDir: input.sortDir ?? null,
          isDefault: input.isDefault ?? false,
        })
        .returning()
      if (row!.isDefault) {
        await this.clearSiblingDefaultsTx(
          tx,
          row!.id,
          row!.organizationId,
          row!.entityType,
          row!.userId,
        )
      }
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'saved_view',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { name: row!.name, entityType: row!.entityType, isDefault: row!.isDefault },
      })
      return rowToContract(row!)
    })
  }

  async update(input: SavedViewUpdateInput): Promise<SavedView> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(savedViews)
        .where(
          and(
            eq(savedViews.id, input.id),
            eq(savedViews.organizationId, input.organizationId),
            sql`${savedViews.deletedAt} IS NULL`,
          ),
        )
        .limit(1)
      if (!before) throw new Error('Saved view not found')

      const patch: Partial<typeof savedViews.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.filters !== undefined) patch.filters = input.filters
      if (input.sortBy !== undefined) patch.sortBy = input.sortBy ?? null
      if (input.sortDir !== undefined) patch.sortDir = input.sortDir ?? null
      if (input.isDefault !== undefined) patch.isDefault = input.isDefault

      const [row] = await tx
        .update(savedViews)
        .set(patch)
        .where(and(eq(savedViews.id, input.id), eq(savedViews.organizationId, input.organizationId)))
        .returning()

      if (input.isDefault === true) {
        await this.clearSiblingDefaultsTx(
          tx,
          row!.id,
          row!.organizationId,
          row!.entityType,
          row!.userId,
        )
      }

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'saved_view',
        entityId: row!.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { name: before.name, isDefault: before.isDefault },
        after: { name: row!.name, isDefault: row!.isDefault },
      })
      return rowToContract(row!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(savedViews)
        .where(
          and(
            eq(savedViews.id, id),
            eq(savedViews.organizationId, organizationId),
            sql`${savedViews.deletedAt} IS NULL`,
          ),
        )
        .limit(1)
      if (!before) return
      await tx
        .update(savedViews)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'saved_view',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { name: before.name },
      })
    })
  }

  async setDefault(id: string, organizationId: string): Promise<SavedView> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .update(savedViews)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(savedViews.id, id),
            eq(savedViews.organizationId, organizationId),
            sql`${savedViews.deletedAt} IS NULL`,
          ),
        )
        .returning()
      if (!row) throw new Error('Saved view not found')
      await this.clearSiblingDefaultsTx(
        tx,
        row.id,
        row.organizationId,
        row.entityType,
        row.userId,
      )
      await audit.record({
        organizationId,
        entityType: 'saved_view',
        entityId: row.id,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: { kind: 'saved_view.set_default' },
        after: { isDefault: true },
      })
      return rowToContract(row)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async clearSiblingDefaultsTx(
    tx: any,
    keepId: string,
    organizationId: string,
    entityType: string,
    userId: string | null,
  ): Promise<void> {
    await tx
      .update(savedViews)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(savedViews.organizationId, organizationId),
          eq(savedViews.entityType, entityType),
          userId === null ? isNull(savedViews.userId) : eq(savedViews.userId, userId),
          eq(savedViews.isDefault, true),
          sql`${savedViews.id} <> ${keepId}`,
        ),
      )
  }
}
