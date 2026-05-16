/**
 * shared/mocks/property-attachment.mock.ts — MockPropertyAttachmentService
 * (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - Same stub upload seam as photos: `url` accepts data: URLs or
 *     `local://attachments/<uuid>` placeholders; W3-1 swaps in real S3/R2.
 *   - No update — kind/name are set at upload time and the document
 *     is immutable thereafter. To re-classify, delete and re-upload.
 */
import type {
  IPropertyAttachmentService,
  PropertyAttachment,
  PropertyAttachmentCreateInput,
} from '../contracts/property-attachment'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: PropertyAttachment[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockPropertyAttachmentService implements IPropertyAttachmentService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<PropertyAttachment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows.filter(r => r.organizationId === organizationId && !r.deletedAt)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<PropertyAttachment[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return rows
      .filter(r => r.organizationId === organizationId && r.propertyId === propertyId && !r.deletedAt)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(id: string, organizationId: string): Promise<PropertyAttachment | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  // TODO(W3-1): swap for sealed-secret S3/R2 signed-URL upload.
  async create(input: PropertyAttachmentCreateInput): Promise<PropertyAttachment> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = nowIso()
    const row: PropertyAttachment = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      kind: input.kind ?? 'other',
      name: input.name,
      url: input.url,
      uploadedByUserId: input.uploadedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Attachment not found')
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }
}

/** Test-only: reset store. */
export function __resetPropertyAttachmentMock(): void {
  rows.length = 0
}
