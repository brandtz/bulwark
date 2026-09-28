/**
 * server/services/property-attachment.real.ts — RealPropertyAttachmentService
 * (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Same stub upload seam as photos. `url` is whatever the UI hands us
 *     (data URL or `local://attachments/<uuid>`) until W3-1 swaps in S3/R2.
 *   - No update method — kind/name are set at upload time and the
 *     document is immutable. Re-classify by delete + re-upload.
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import type {
  IPropertyAttachmentService,
  PropertyAttachment,
  PropertyAttachmentCreateInput,
} from '../../shared/contracts/property-attachment'
import { getDb } from '../db/client'
import { propertyAttachments } from '../db/schema/property_attachments'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbPropertyAttachmentToContract } from './_row-mappers'
import { assertStorableUrlOrKey } from '../../shared/utils/storage-url'
import { assertOwnedAssetKey, signAssetUrl } from './storage/asset-urls'

// WP-L02: rows store storage keys; callers receive short-lived signed URLs.
async function signAttachment(a: PropertyAttachment): Promise<PropertyAttachment> {
  return { ...a, url: await signAssetUrl(a.url, a.name) }
}
const signAttachments = (list: PropertyAttachment[]) => Promise.all(list.map(signAttachment))

export class RealPropertyAttachmentService implements IPropertyAttachmentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(organizationId: string): Promise<PropertyAttachment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyAttachments)
      .where(
        and(
          eq(propertyAttachments.organizationId, organizationId),
          sql`${propertyAttachments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(propertyAttachments.createdAt))
    return signAttachments(rows.map(dbPropertyAttachmentToContract))
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<PropertyAttachment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(propertyAttachments)
      .where(
        and(
          eq(propertyAttachments.organizationId, organizationId),
          eq(propertyAttachments.propertyId, propertyId),
          sql`${propertyAttachments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(propertyAttachments.createdAt))
    return signAttachments(rows.map(dbPropertyAttachmentToContract))
  }

  async get(id: string, organizationId: string): Promise<PropertyAttachment | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(propertyAttachments)
      .where(
        and(
          eq(propertyAttachments.id, id),
          eq(propertyAttachments.organizationId, organizationId),
          sql`${propertyAttachments.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? signAttachment(dbPropertyAttachmentToContract(row)) : null
  }

  // L01-S3: reject placeholder asset URLs in prod. L02-S2 migrates this to a
  // storage key minted via the object-storage service (presign + finalize).
  async create(input: PropertyAttachmentCreateInput): Promise<PropertyAttachment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    assertStorableUrlOrKey(input.url)
    await assertOwnedAssetKey(input.url, input.organizationId, 'property_attachment')
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(propertyAttachments)
        .values({
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          kind: input.kind ?? 'other',
          name: input.name,
          url: input.url,
          uploadedByUserId: input.uploadedByUserId ?? this.actorUserId(),
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'property_attachment',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { name: row!.name, kind: row!.kind, propertyId: row!.propertyId },
      })
      return signAttachment(dbPropertyAttachmentToContract(row!))
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(propertyAttachments)
        .where(
          and(eq(propertyAttachments.id, id), eq(propertyAttachments.organizationId, organizationId)),
        )
        .limit(1)
      if (!before) throw new Error('Attachment not found')
      const now = new Date()
      await tx
        .update(propertyAttachments)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(eq(propertyAttachments.id, id), eq(propertyAttachments.organizationId, organizationId)),
        )
      await audit.record({
        organizationId,
        entityType: 'property_attachment',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { name: before.name, kind: before.kind },
      })
    })
  }
}
