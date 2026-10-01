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
import { and, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type {
  IPropertyService,
  Property,
  PropertyCreateInput,
  PropertyDepth,
  PropertyListInput,
  PropertyListOutput,
  PropertyStatusDetails,
  PropertyStatusValue,
  PropertySummary,
  PropertyUpdateInput,
} from '../../shared/contracts/property'
import { getDb } from '../db/client'
import { properties } from '../db/schema/properties'
import { buildings } from '../db/schema/buildings'
import { buildingSections } from '../db/schema/building_sections'
import { contacts } from '../db/schema/contacts'
import { propertyPhotos } from '../db/schema/property_photos'
import { memberships } from '../db/schema/users'
import { quotes } from '../db/schema/quotes'
import { invoices } from '../db/schema/invoices'
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
import { RealStatusPipelineService } from './status-pipeline.real'
import { isWithheld, signAssetUrl } from './storage/asset-urls'
import { keysetCursor, pageWindow } from './_pagination'

export class RealPropertyService implements IPropertyService {
  private readonly statusPipelines: RealStatusPipelineService

  constructor(private readonly tenantResolver?: TenantResolver) {
    this.statusPipelines = new RealStatusPipelineService(tenantResolver)
  }

  async list(input: PropertyListInput): Promise<PropertyListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()

    const conditions: SQL[] = [
      eq(properties.organizationId, input.organizationId),
      sql`${properties.deletedAt} IS NULL`,
    ]
    if (input.status) conditions.push(eq(properties.status, input.status))
    if (input.assigneeUserId === 'none') conditions.push(isNull(properties.assigneeUserId))
    else if (input.assigneeUserId) conditions.push(eq(properties.assigneeUserId, input.assigneeUserId))
    if (input.search) {
      // W5-3 / ADR-0037: escape LIKE wildcards in user input.
      const q = escapeLikeContains(input.search)
      const like = or(ilike(properties.addressLine1, q), ilike(properties.city, q))
      if (like) conditions.push(like)
    }
    const whereClause = and(...conditions)!

    const win = pageWindow(input, properties.createdAt, properties.id)
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(properties)
        .where(and(whereClause, win.where))
        .orderBy(...win.orderBy)
        .limit(input.pageSize)
        .offset(win.offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(properties)
        .where(whereClause),
    ])
    const mapped = rows.map(dbPropertyToContract)
    return {
      rows: mapped,
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
      nextCursor: await keysetCursor(db, properties, properties.createdAt, properties.id, rows, input.pageSize),
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

  async getMany(ids: string[], organizationId: string): Promise<Property[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    if (unique.length > 500) throw new Error('Invalid getMany: at most 500 ids')
    const rows = await getDb()
      .select()
      .from(properties)
      .where(
        and(
          inArray(properties.id, unique),
          eq(properties.organizationId, organizationId),
          sql`${properties.deletedAt} IS NULL`,
        ),
      )
    return rows.map(dbPropertyToContract)
  }

  async summaries(ids: string[], organizationId: string): Promise<PropertySummary[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    if (unique.length > 500) throw new Error('Invalid summaries: at most 500 ids')
    const db = getDb()
    const live = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(inArray(properties.id, unique), eq(properties.organizationId, organizationId), isNull(properties.deletedAt)))
    const liveIds = live.map((r) => r.id)
    if (liveIds.length === 0) return []
    const [quoteRows, invoiceRows] = await Promise.all([
      db
        .select({ propertyId: quotes.propertyId, cents: sql<string>`coalesce(sum(${quotes.totalCents}), 0)` })
        .from(quotes)
        .where(and(inArray(quotes.propertyId, liveIds), eq(quotes.organizationId, organizationId), eq(quotes.status, 'accepted'), isNull(quotes.deletedAt)))
        .groupBy(quotes.propertyId),
      db
        .select({
          propertyId: invoices.propertyId,
          invoiced: sql<string>`coalesce(sum(${invoices.totalCents}), 0)`,
          paid: sql<string>`coalesce(sum(${invoices.paidAmountCents}), 0)`,
          open: sql<string>`count(*) filter (where ${invoices.status} in ('sent', 'partial'))`,
        })
        .from(invoices)
        .where(and(inArray(invoices.propertyId, liveIds), eq(invoices.organizationId, organizationId), inArray(invoices.status, ['sent', 'partial', 'paid']), isNull(invoices.deletedAt)))
        .groupBy(invoices.propertyId),
    ])
    const quoteBy = new Map(quoteRows.map((r) => [r.propertyId, Number(r.cents)]))
    const invoiceBy = new Map(invoiceRows.map((r) => [r.propertyId, r]))
    return liveIds.map((propertyId) => {
      const inv = invoiceBy.get(propertyId)
      const invoicedCents = Number(inv?.invoiced ?? 0)
      const paidCents = Number(inv?.paid ?? 0)
      return {
        propertyId,
        contractValueCents: quoteBy.get(propertyId) ?? 0,
        invoicedCents,
        paidCents,
        balanceCents: invoicedCents - paidCents,
        openInvoiceCount: Number(inv?.open ?? 0),
      }
    })
  }

  async create(input: PropertyCreateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const pipeline = await this.statusPipelines.bootstrap({
      organizationId: input.organizationId,
      entityType: 'property',
    })
    const initialStatus = pipeline.nodes.find((node) => node.isInitial)
    if (!initialStatus) throw new Error('Invalid property pipeline: no initial status')
    if (input.assigneeUserId) await assertAssignable(input.assigneeUserId, input.organizationId)
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
          status: initialStatus.slug,
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
          assigneeUserId: input.assigneeUserId ?? null,
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
      if (input.assigneeUserId !== undefined) {
        if (input.assigneeUserId) await assertAssignable(input.assigneeUserId, input.organizationId)
        patch.assigneeUserId = input.assigneeUserId ?? null
      }

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

  async updateStatus(id: string, status: PropertyStatusValue, organizationId: string, reason?: string, details?: PropertyStatusDetails): Promise<Property> {
    assertSameTenant(this.tenantResolver, organizationId)
    const pipeline = await this.statusPipelines.bootstrap({ organizationId, entityType: 'property' })
    const target = pipeline.nodes.find((node) => node.slug === status)
    if (!target) throw new Error(`Invalid property status: ${status} is not in the active pipeline`)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(properties)
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Property not found')
      const source = pipeline.nodes.find((node) => node.slug === before.status)
      if (!source) throw new Error(`Invalid current property status: ${before.status} is not in the active pipeline`)
      if (before.status !== status && !source.allowedTransitions.includes(status)) {
        throw new Error(`Invalid property status transition: ${before.status} cannot transition to ${status}`)
      }
      if (before.status !== status && target.requiresReason && !reason?.trim()) {
        throw new Error('Invalid property status transition: a reason is required')
      }
      const [after] = await tx
        .update(properties)
        .set(before.status === status
          ? { updatedAt: new Date() }
          : {
              status,
              statusReason: reason?.trim() || null,
              statusNote: details?.note?.trim() || null,
              statusChangedAt: new Date(),
              resumeOn: details?.resumeOn ?? null,
              updatedAt: new Date(),
            })
        .where(and(eq(properties.id, id), eq(properties.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'property',
        entityId: id,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: {
          from: before.status,
          to: status,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
          ...(details?.note?.trim() ? { note: details.note.trim() } : {}),
          ...(details?.resumeOn ? { resumeOn: details.resumeOn } : {}),
        },
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
      // WP-L02 key → signed URL; WP-X3: never a photo this viewer may not see (infected, or unscanned and not theirs).
      primaryPhotoUrl: await signAssetUrl(photoRows.find((p) => !isWithheld(p.scanStatus, p.uploadedByUserId, this.actorUserId()))?.url ?? null),
    }
  }
}

/** WP-B2: an assignee must be an active staff member of the property's org. */
async function assertAssignable(userId: string, organizationId: string): Promise<void> {
  const [row] = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId), eq(memberships.isActive, true), isNull(memberships.deletedAt)))
    .limit(1)
  if (!row || !['super_admin', 'org_admin', 'org_manager', 'field'].includes(row.role)) {
    throw new Error('Invalid assignee: not an active staff member of this organization')
  }
}
