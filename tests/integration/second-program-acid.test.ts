import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../../server/db/client'
import { organizations } from '../../server/db/schema/organizations'
import { users } from '../../server/db/schema/users'
import { properties } from '../../server/db/schema/properties'
import { programMemberships } from '../../server/db/schema/program_memberships'
import { programs } from '../../server/db/schema/programs'
import { inspectionTemplates } from '../../server/db/schema/inspection_templates'
import { inspectionTemplateSections } from '../../server/db/schema/inspection_template_sections'
import { inspectionTemplateFields } from '../../server/db/schema/inspection_template_fields'
import { trades } from '../../server/db/schema/trades'
import { statusPipelines, statusPipelineNodes } from '../../server/db/schema/status_pipelines'
import { quotes } from '../../server/db/schema/quotes'
import { workOrders } from '../../server/db/schema/work_orders'
import { invoices } from '../../server/db/schema/invoices'
import { deliverables } from '../../server/db/schema/deliverables'
import { auditLog } from '../../server/db/schema/audit_log'
import { RealProgramService } from '../../server/services/program.real'
import { RealInspectionTemplateService } from '../../server/services/inspection-template.real'
import { RealTradeService } from '../../server/services/trade.real'
import { RealPropertyService } from '../../server/services/property.real'
import { RealQuoteService } from '../../server/services/quote.real'
import { RealWorkOrderService } from '../../server/services/work-order.real'
import { RealInvoiceService } from '../../server/services/invoice.real'
import { RealDeliverableService } from '../../server/services/deliverable.real'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip

d('WP-X1 second-program acid test', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId: string
  let userId: string

  beforeAll(async () => {
    const db = getDb()
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'X1 Kitchen & Bath', slug: `x1-acid-${stamp}` })
      .returning()
    organizationId = organization!.id
    const [user] = await db
      .insert(users)
      .values({
        email: `x1-acid-${stamp}@example.test`,
        fullName: 'X1 Acid Test',
        passwordHash: await bcrypt.hash('unused', 4),
        isActive: true,
      })
      .returning()
    userId = user!.id
  })

  afterAll(async () => {
    if (!organizationId) return
    const db = getDb()
    const templates = await db
      .select({ id: inspectionTemplates.id })
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.organizationId, organizationId))
    const templateIds = templates.map((template) => template.id)
    const sections = templateIds.length
      ? await db
          .select({ id: inspectionTemplateSections.id })
          .from(inspectionTemplateSections)
          .where(inArray(inspectionTemplateSections.templateId, templateIds))
      : []

    await db.delete(auditLog).where(eq(auditLog.organizationId, organizationId))
    await db.delete(deliverables).where(eq(deliverables.organizationId, organizationId))
    await db.delete(invoices).where(eq(invoices.organizationId, organizationId))
    await db.delete(workOrders).where(eq(workOrders.organizationId, organizationId))
    await db.delete(quotes).where(eq(quotes.organizationId, organizationId))
    await db.delete(programMemberships).where(eq(programMemberships.organizationId, organizationId))
    if (sections.length) {
      await db.delete(inspectionTemplateFields).where(
        inArray(inspectionTemplateFields.sectionId, sections.map((section) => section.id)),
      )
      await db.delete(inspectionTemplateSections).where(
        inArray(inspectionTemplateSections.id, sections.map((section) => section.id)),
      )
    }
    if (templateIds.length) {
      await db.delete(inspectionTemplates).where(inArray(inspectionTemplates.id, templateIds))
    }
    const pipelines = await db
      .select({ id: statusPipelines.id })
      .from(statusPipelines)
      .where(eq(statusPipelines.organizationId, organizationId))
    if (pipelines.length) {
      await db.delete(statusPipelineNodes).where(
        inArray(statusPipelineNodes.pipelineId, pipelines.map((pipeline) => pipeline.id)),
      )
    }
    await db.delete(statusPipelines).where(eq(statusPipelines.organizationId, organizationId))
    await db.delete(trades).where(eq(trades.organizationId, organizationId))
    await db.delete(properties).where(eq(properties.organizationId, organizationId))
    await db.delete(programs).where(eq(programs.organizationId, organizationId))
    await db.delete(users).where(eq(users.id, userId))
    await db.delete(organizations).where(eq(organizations.id, organizationId))
  })

  it('runs Kitchen & Bath and a second program through quote, job, and invoice without a deliverable', async () => {
    const propertyService = new RealPropertyService()
    const programService = new RealProgramService()
    const templateService = new RealInspectionTemplateService()
    const tradeService = new RealTradeService()
    const quoteService = new RealQuoteService()
    const workOrderService = new RealWorkOrderService()
    const invoiceService = new RealInvoiceService()

    const kitchenProgram = await programService.create({
      organizationId,
      slug: 'kitchen-bath',
      name: 'Kitchen & Bath',
      kind: 'inspection_program',
      defaultTradeSlots: [{ tradeSlug: 'cabinet-install', quantity: 1 }],
    })
    const secondProgram = await programService.create({
      organizationId,
      slug: 'deck-renovation',
      name: 'Deck Renovation',
      kind: 'service_program',
    })
    const template = await templateService.create({
      organizationId,
      programId: kitchenProgram.id,
      slug: 'kitchen-condition',
      name: 'Kitchen Condition',
    })
    const section = await templateService.addSection({
      organizationId,
      templateId: template.id,
      slug: 'cabinetry',
      name: 'Cabinetry',
    })
    await templateService.addField({
      organizationId,
      sectionId: section.id,
      slug: 'cabinet-condition',
      label: 'Cabinet condition',
      kind: 'select',
      options: [
        { value: 'good', label: 'Good' },
        { value: 'repair', label: 'Repair needed' },
      ],
      required: true,
    })
    const configuredKitchen = await programService.update({
      id: kitchenProgram.id,
      organizationId,
      inspectionTemplateId: template.id,
    })
    expect(configuredKitchen.inspectionTemplateId).toBe(template.id)

    const customTrade = await tradeService.create({
      organizationId,
      slug: 'cabinet-install',
      name: 'Cabinet installation',
    })
    const property = await propertyService.create({
      organizationId,
      addressLine1: '100 Second Program Way',
      addressLine2: null,
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      clientId: null,
      notes: null,
    })
    await programService.assignToEntity({
      organizationId,
      programId: kitchenProgram.id,
      entityType: 'property',
      entityId: property.id,
    })
    await programService.assignToEntity({
      organizationId,
      programId: secondProgram.id,
      entityType: 'property',
      entityId: property.id,
    })

    const quote = await quoteService.create({
      organizationId,
      propertyId: property.id,
      assessmentId: null,
      createdById: userId,
      expiresAt: null,
      lineItems: [{
        id: randomUUID(),
        kind: 'labor',
        description: 'Install kitchen cabinets',
        quantity: 1,
        unitCostCents: 250_000,
        sourceField: 'cabinet-install',
      }],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    })
    await quoteService.markSent(quote.id, organizationId)
    const acceptedQuote = await quoteService.markAccepted(quote.id, organizationId)
    const workOrder = await workOrderService.create({
      organizationId,
      propertyId: property.id,
      quoteId: acceptedQuote.id,
      scheduledStart: null,
      scheduledEnd: null,
      tradeSlots: [{
        id: randomUUID(),
        trade: customTrade.slug,
        description: 'Install cabinets',
        status: 'unassigned',
        assignedSubcontractorId: null,
        scheduledStart: null,
        scheduledEnd: null,
        notes: null,
      }],
      materials: [],
      notes: null,
      createdById: userId,
    })
    const invoice = await invoiceService.create({
      organizationId,
      propertyId: property.id,
      workOrderId: workOrder.id,
      quoteId: acceptedQuote.id,
      dueAt: null,
      lineItems: [{
        id: randomUUID(),
        kind: 'labor',
        description: 'Install kitchen cabinets',
        quantity: 1,
        unitCostCents: 250_000,
      }],
      markupPercent: 0,
      taxPercent: 0,
      notes: null,
    })

    expect(customTrade.isActive).toBe(true)
    expect((await programService.listMembershipsFor({
      organizationId,
      entityType: 'property',
      entityId: property.id,
    }))).toHaveLength(2)
    expect(quote.status).toBe('draft')
    expect(acceptedQuote.status).toBe('accepted')
    expect(workOrder.tradeSlots[0]?.trade).toBe('cabinet-install')
    expect(invoice.workOrderId).toBe(workOrder.id)
    expect(await new RealDeliverableService().list({ organizationId })).toEqual([])
  })
})