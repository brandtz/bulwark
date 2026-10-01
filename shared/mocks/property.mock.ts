/**
 * shared/mocks/property.mock.ts — MockPropertyService.
 *
 * Backed by the in-memory FIXTURE_PROPERTIES list. Every method enforces
 * organizationId scoping so any UI bug that drops scope is caught even
 * against the mock.
 *
 * # Decisions (ADR-0008)
 *   - E2-S7 tenant firewall: every method that takes an `organizationId`
 *     calls `assertSameTenant(this.tenantResolver, ...)` first. If the
 *     active session belongs to a different org than the request, we throw
 *     `TenantViolationError` BEFORE touching the row store. This makes a
 *     UI bug that forwards a stale org id loud and immediate.
 *   - The resolver is optional — when constructed without one (e.g. unit
 *     tests), the firewall short-circuits and the mock behaves the same
 *     as before. The factory wires a real resolver in production paths.
 */
import type {
  IPropertyService, Property, PropertyCreateInput, PropertyDepth, PropertyListInput,
  PropertyListOutput, PropertyStatusDetails, PropertyStatusValue, PropertySummary, PropertyUpdateInput,
} from '../contracts/property'
import type { IQuoteService } from '../contracts/quote'
import type { IInvoiceService } from '../contracts/invoice'
import { FIXTURE_PROPERTIES } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'
import type { MockBuildingService } from './building.mock'
import type { MockContactService } from './contact.mock'
import type { MockPropertyPhotoService } from './property-photo.mock'
import { MockStatusPipelineService } from './status-pipeline.mock'
import { compareNewestFirst, pageRows } from '../utils/pagination'

const rows: Property[] = [...FIXTURE_PROPERTIES]
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export class MockPropertyService implements IPropertyService {
  private readonly statusPipelines: MockStatusPipelineService
  // W2-1 / EH-E — `getWithDepth` needs to read from sibling mock services.
  // The factory wires these in via `attachDepthSources` after all four
  // mocks are constructed (the contact mock needs the property mock too,
  // so we resolve the cycle with a setter rather than constructor args).
  private buildingSvc: MockBuildingService | null = null
  private contactSvc: MockContactService | null = null
  private photoSvc: MockPropertyPhotoService | null = null
  private moneySources: { quote: IQuoteService, invoice: IInvoiceService } | null = null

  constructor(private readonly tenantResolver?: TenantResolver) {
    this.statusPipelines = new MockStatusPipelineService(tenantResolver)
  }

  attachDepthSources(deps: {
    building: MockBuildingService
    contact: MockContactService
    photo: MockPropertyPhotoService
  }): void {
    this.buildingSvc = deps.building
    this.contactSvc = deps.contact
    this.photoSvc = deps.photo
  }

  /** WP-B2: `summaries` reads the quote and invoice mocks (wired by the factory). */
  attachMoneySources(deps: { quote: IQuoteService, invoice: IInvoiceService }): void {
    this.moneySources = deps
  }

  async summaries(ids: string[], organizationId: string): Promise<PropertySummary[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const live = await this.getMany(ids, organizationId)
    return Promise.all(live.map(async ({ id: propertyId }) => {
      const quotes = this.moneySources
        ? (await this.moneySources.quote.list({ organizationId, propertyId, status: 'accepted', page: 1, pageSize: 200 })).rows
        : []
      const invoices = this.moneySources
        ? (await this.moneySources.invoice.list({ organizationId, propertyId, page: 1, pageSize: 200 })).rows
            .filter((i) => i.status === 'sent' || i.status === 'partial' || i.status === 'paid')
        : []
      const invoicedCents = invoices.reduce((s, i) => s + i.totals.totalCents, 0)
      const paidCents = invoices.reduce((s, i) => s + i.paidAmountCents, 0)
      return {
        propertyId,
        contractValueCents: quotes.reduce((s, q) => s + q.totals.totalCents, 0),
        invoicedCents,
        paidCents,
        balanceCents: invoicedCents - paidCents,
        openInvoiceCount: invoices.filter((i) => i.status !== 'paid').length,
      }
    }))
  }

  async list(input: PropertyListInput): Promise<PropertyListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter(r =>
      r.organizationId === input.organizationId && r.deletedAt === null
    )
    if (input.status) scoped = scoped.filter(r => r.status === input.status)
    if (input.assigneeUserId === 'none') scoped = scoped.filter(r => r.assigneeUserId === null)
    else if (input.assigneeUserId) scoped = scoped.filter(r => r.assigneeUserId === input.assigneeUserId)
    if (input.search) {
      const q = input.search.toLowerCase()
      scoped = scoped.filter(r =>
        r.addressLine1.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q),
      )
    }
    const total = scoped.length
    // WP-L06 S3: same newest-first order, offset cap and keyset cursor as the real service.
    const paged = pageRows(scoped.slice().sort(compareNewestFirst), input)
    return {
      rows: paged.rows,
      total,
      page: input.page,
      pageSize: input.pageSize,
      nextCursor: paged.nextCursor,
    }
  }

  async get(id: string, organizationId: string): Promise<Property | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async getMany(ids: string[], organizationId: string): Promise<Property[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const wanted = new Set(ids)
    if (wanted.size > 500) throw new Error('Invalid getMany: at most 500 ids')
    return rows.filter((x) => wanted.has(x.id) && x.organizationId === organizationId && !x.deletedAt)
  }

  async create(input: PropertyCreateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const pipeline = await this.statusPipelines.bootstrap({
      organizationId: input.organizationId,
      entityType: 'property',
    })
    const initialStatus = pipeline.nodes.find((node) => node.isInitial)
    if (!initialStatus) throw new Error('Invalid property pipeline: no initial status')
    const now = nowIso()
    const row: Property = {
      id: newId(),
      organizationId: input.organizationId,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      clientId: input.clientId ?? null,
      status: initialStatus.slug,
      notes: input.notes ?? null,
      lotSizeAcres: input.lotSizeAcres ?? null,
      parcelNumber: input.parcelNumber ?? null,
      yearBuilt: input.yearBuilt ?? null,
      accessNotes: input.accessNotes ?? null,
      gateCode: input.gateCode ?? null,
      specialInstructions: input.specialInstructions ?? null,
      primaryContactId: input.primaryContactId ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      statusReason: null,
      statusNote: null,
      statusChangedAt: null,
      resumeOn: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async update(input: PropertyUpdateInput): Promise<Property> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(x => x.id === input.id && x.organizationId === input.organizationId)
    if (!r) throw new Error('Property not found')
    Object.assign(r, input, { updatedAt: nowIso() })
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    r.deletedAt = nowIso()
  }

  async updateStatus(id: string, status: PropertyStatusValue, organizationId: string, reason?: string, details?: PropertyStatusDetails): Promise<Property> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(x => x.id === id && x.organizationId === organizationId)
    if (!r) throw new Error('Property not found')
    const pipeline = await this.statusPipelines.bootstrap({ organizationId, entityType: 'property' })
    const target = pipeline.nodes.find((node) => node.slug === status)
    if (!target) throw new Error(`Invalid property status: ${status} is not in the active pipeline`)
    const source = pipeline.nodes.find((node) => node.slug === r.status)
    if (!source) throw new Error(`Invalid current property status: ${r.status} is not in the active pipeline`)
    if (r.status !== status && !source.allowedTransitions.includes(status)) {
      throw new Error(`Invalid property status transition: ${r.status} cannot transition to ${status}`)
    }
    if (r.status !== status && target.requiresReason && !reason?.trim()) {
      throw new Error('Invalid property status transition: a reason is required')
    }
    if (r.status !== status) {
      r.status = status
      r.statusReason = reason?.trim() || null
      r.statusNote = details?.note?.trim() || null
      r.statusChangedAt = nowIso()
      r.resumeOn = details?.resumeOn ?? null
    }
    r.updatedAt = nowIso()
    return r
  }

  async getWithDepth(propertyId: string, organizationId: string): Promise<PropertyDepth | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const property = await this.get(propertyId, organizationId)
    if (!property) return null
    const buildings = this.buildingSvc
      ? await this.buildingSvc.listForProperty(propertyId, organizationId)
      : []
    const buildingsWithSections = await Promise.all(
      buildings.map(async (b) => ({
        ...b,
        sections: this.buildingSvc
          ? await this.buildingSvc.listSections(b.id, organizationId)
          : [],
      })),
    )
    const contacts = this.contactSvc
      ? await this.contactSvc.listForProperty(propertyId, organizationId)
      : []
    const photos = this.photoSvc
      ? await this.photoSvc.listForProperty(propertyId, organizationId)
      : []
    const primaryPhotoUrl = photos[0]?.url ?? null
    return {
      property,
      buildings: buildingsWithSections,
      contacts,
      primaryPhotoUrl,
    }
  }
}
