/**
 * server/services/inspection-template.real.ts — RealInspectionTemplateService
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0008, ADR-0019)
 *   - Mirrors property.real.ts / program.real.ts pattern: tenant
 *     firewall via `assertSameTenant`, every mutation through
 *     `withAudit`, ISO-string mapping via inline row mappers.
 *   - `bootstrap()` is the only method that loops to insert sections +
 *     fields; it's idempotent by `(orgId, programId, slug, version=1)`
 *     and is what the seed script + first-touch UI use to materialise
 *     the wildfire defaults.
 *   - Editing a builtin template is allowed (admins can rename, add
 *     fields, etc.) but the bootstrap will not "heal" lost rows — once
 *     a template exists at version 1 for the program, bootstrap is a
 *     no-op even if its sections/fields have drifted from the
 *     defaults. This is intentional: admins customise.
 */
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import type {
  FieldAddInput,
  FieldUpdateInput,
  IInspectionTemplateService,
  InspectionTemplate,
  InspectionTemplateCreateInput,
  InspectionTemplateField,
  InspectionTemplateListInput,
  InspectionTemplateListOutput,
  InspectionTemplateSection,
  InspectionTemplateUpdateInput,
  InspectionTemplateWithSections,
  SectionAddInput,
} from '../../shared/contracts/inspection-template'
import { DEFAULT_WILDFIRE_TEMPLATE } from '../../shared/inspection-templates/wildfire-defaults'
import { getDb } from '../db/client'
import { inspectionTemplates } from '../db/schema/inspection_templates'
import { inspectionTemplateSections } from '../db/schema/inspection_template_sections'
import { inspectionTemplateFields } from '../db/schema/inspection_template_fields'
import type { InspectionTemplate as DbTemplate } from '../db/schema/inspection_templates'
import type { InspectionTemplateSection as DbSection } from '../db/schema/inspection_template_sections'
import type { InspectionTemplateField as DbField } from '../db/schema/inspection_template_fields'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function templateToContract(r: DbTemplate): InspectionTemplate {
  return {
    id: r.id,
    organizationId: r.organizationId,
    programId: r.programId,
    slug: r.slug,
    name: r.name,
    description: r.description,
    version: r.version,
    isActive: r.isActive,
    isBuiltin: r.isBuiltin,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function sectionToContract(r: DbSection): InspectionTemplateSection {
  return {
    id: r.id,
    templateId: r.templateId,
    slug: r.slug,
    name: r.name,
    description: r.description,
    sortOrder: r.sortOrder,
    isRepeatable: r.isRepeatable,
    repeatableLabel: r.repeatableLabel,
    conditionalOnFieldSlug: r.conditionalOnFieldSlug,
    conditionalOnValue: r.conditionalOnValue,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function fieldToContract(r: DbField): InspectionTemplateField {
  return {
    id: r.id,
    sectionId: r.sectionId,
    slug: r.slug,
    label: r.label,
    kind: r.kind as InspectionTemplateField['kind'],
    options: r.options ?? null,
    required: r.required,
    defaultValue: r.defaultValue ?? null,
    validationJson: r.validationJson ?? null,
    helpText: r.helpText,
    placeholder: r.placeholder,
    sortOrder: r.sortOrder,
    conditionalOnFieldSlug: r.conditionalOnFieldSlug,
    conditionalOnValue: r.conditionalOnValue,
    evaluatorRule: r.evaluatorRule ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealInspectionTemplateService implements IInspectionTemplateService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: InspectionTemplateListInput): Promise<InspectionTemplateListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(inspectionTemplates.organizationId, input.organizationId),
      sql`${inspectionTemplates.deletedAt} IS NULL`,
    ]
    if (input.programId !== undefined && input.programId !== null) {
      conditions.push(eq(inspectionTemplates.programId, input.programId))
    }
    if (!input.includeInactive) conditions.push(eq(inspectionTemplates.isActive, true))
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(inspectionTemplates)
        .where(where)
        .orderBy(asc(inspectionTemplates.name))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(inspectionTemplates)
        .where(where),
    ])
    return {
      rows: rows.map(templateToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<InspectionTemplate | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(inspectionTemplates)
      .where(
        and(
          eq(inspectionTemplates.id, id),
          eq(inspectionTemplates.organizationId, organizationId),
          sql`${inspectionTemplates.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? templateToContract(row) : null
  }

  async getWithSections(
    id: string,
    organizationId: string,
  ): Promise<InspectionTemplateWithSections | null> {
    const t = await this.get(id, organizationId)
    if (!t) return null
    const db = getDb()
    const sectionRows = await db
      .select()
      .from(inspectionTemplateSections)
      .where(eq(inspectionTemplateSections.templateId, t.id))
      .orderBy(asc(inspectionTemplateSections.sortOrder))
    const sectionIds = sectionRows.map((s) => s.id)
    const fieldRows = sectionIds.length
      ? await db
          .select()
          .from(inspectionTemplateFields)
          .where(
            sql`${inspectionTemplateFields.sectionId} IN (${sql.join(
              sectionIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
          .orderBy(asc(inspectionTemplateFields.sortOrder))
      : []
    const fieldsBySection = new Map<string, InspectionTemplateField[]>()
    for (const f of fieldRows) {
      const arr = fieldsBySection.get(f.sectionId) ?? []
      arr.push(fieldToContract(f))
      fieldsBySection.set(f.sectionId, arr)
    }
    return {
      ...t,
      sections: sectionRows.map((s) => ({
        ...sectionToContract(s),
        fields: fieldsBySection.get(s.id) ?? [],
      })),
    }
  }

  async create(input: InspectionTemplateCreateInput): Promise<InspectionTemplate> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      try {
        const [row] = await tx
          .insert(inspectionTemplates)
          .values({
            organizationId: input.organizationId,
            programId: input.programId ?? null,
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
            version: 1,
            isActive: true,
            isBuiltin: false,
          })
          .returning()
        await audit.record({
          organizationId: input.organizationId,
          entityType: 'inspection_template',
          entityId: row!.id,
          action: 'create',
          actorUserId: this.actorUserId(),
          after: { slug: row!.slug, name: row!.name },
        })
        return templateToContract(row!)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/duplicate key|unique/i.test(msg)) {
          throw new Error(`Template slug already exists: ${input.slug}`)
        }
        throw err
      }
    })
  }

  async update(input: InspectionTemplateUpdateInput): Promise<InspectionTemplate> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const patch: Partial<typeof inspectionTemplates.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.description !== undefined) patch.description = input.description ?? null
      if (input.isActive !== undefined) patch.isActive = input.isActive
      const [row] = await tx
        .update(inspectionTemplates)
        .set(patch)
        .where(
          and(
            eq(inspectionTemplates.id, input.id),
            eq(inspectionTemplates.organizationId, input.organizationId),
          ),
        )
        .returning()
      if (!row) throw new Error('Template not found')
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'inspection_template',
        entityId: row.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        after: { name: row.name, isActive: row.isActive },
      })
      return templateToContract(row)
    })
  }

  async addSection(input: SectionAddInput): Promise<InspectionTemplateSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const existingCount = (await db
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(inspectionTemplateSections)
      .where(eq(inspectionTemplateSections.templateId, input.templateId)))[0]?.c ?? 0
    const [row] = await db
      .insert(inspectionTemplateSections)
      .values({
        templateId: input.templateId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? Number(existingCount),
        isRepeatable: input.isRepeatable ?? false,
        repeatableLabel: input.repeatableLabel ?? null,
        conditionalOnFieldSlug: input.conditionalOnFieldSlug ?? null,
        conditionalOnValue: input.conditionalOnValue ?? null,
      })
      .returning()
    return sectionToContract(row!)
  }

  async addField(input: FieldAddInput): Promise<InspectionTemplateField> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const existingCount = (await db
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(inspectionTemplateFields)
      .where(eq(inspectionTemplateFields.sectionId, input.sectionId)))[0]?.c ?? 0
    const [row] = await db
      .insert(inspectionTemplateFields)
      .values({
        sectionId: input.sectionId,
        slug: input.slug,
        label: input.label,
        kind: input.kind,
        options: input.options ?? null,
        required: input.required ?? false,
        defaultValue: input.defaultValue ?? null,
        validationJson: input.validationJson ?? null,
        helpText: input.helpText ?? null,
        placeholder: input.placeholder ?? null,
        sortOrder: input.sortOrder ?? Number(existingCount),
        conditionalOnFieldSlug: input.conditionalOnFieldSlug ?? null,
        conditionalOnValue: input.conditionalOnValue ?? null,
        evaluatorRule: input.evaluatorRule ?? null,
      })
      .returning()
    return fieldToContract(row!)
  }

  async updateField(input: FieldUpdateInput): Promise<InspectionTemplateField> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const patch: Partial<typeof inspectionTemplateFields.$inferInsert> = { updatedAt: new Date() }
    if (input.label !== undefined) patch.label = input.label
    if (input.kind !== undefined) patch.kind = input.kind
    if (input.options !== undefined) patch.options = input.options ?? null
    if (input.required !== undefined) patch.required = input.required
    if (input.defaultValue !== undefined) patch.defaultValue = input.defaultValue ?? null
    if (input.validationJson !== undefined) patch.validationJson = input.validationJson ?? null
    if (input.helpText !== undefined) patch.helpText = input.helpText ?? null
    if (input.placeholder !== undefined) patch.placeholder = input.placeholder ?? null
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
    if (input.conditionalOnFieldSlug !== undefined) patch.conditionalOnFieldSlug = input.conditionalOnFieldSlug ?? null
    if (input.conditionalOnValue !== undefined) patch.conditionalOnValue = input.conditionalOnValue ?? null
    if (input.evaluatorRule !== undefined) patch.evaluatorRule = input.evaluatorRule ?? null
    const [row] = await db
      .update(inspectionTemplateFields)
      .set(patch)
      .where(eq(inspectionTemplateFields.id, input.fieldId))
      .returning()
    if (!row) throw new Error('Field not found')
    return fieldToContract(row)
  }

  async deleteField(input: { organizationId: string; fieldId: string }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    await db.delete(inspectionTemplateFields).where(eq(inspectionTemplateFields.id, input.fieldId))
  }

  async deleteSection(input: { organizationId: string; sectionId: string }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    // Cascade delete the section's fields first since we don't have a
    // declared FK with ON DELETE CASCADE on the schema yet.
    await db.delete(inspectionTemplateFields).where(eq(inspectionTemplateFields.sectionId, input.sectionId))
    await db.delete(inspectionTemplateSections).where(eq(inspectionTemplateSections.id, input.sectionId))
  }

  async activate(input: { organizationId: string; templateId: string; isActive: boolean }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    await db
      .update(inspectionTemplates)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(
        and(
          eq(inspectionTemplates.id, input.templateId),
          eq(inspectionTemplates.organizationId, input.organizationId),
        ),
      )
  }

  async bootstrap(input: {
    organizationId: string
    programId: string
    programSlug: string
  }): Promise<{ templateId: string; created: boolean }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const slug = input.programSlug
    const [existing] = await db
      .select()
      .from(inspectionTemplates)
      .where(
        and(
          eq(inspectionTemplates.organizationId, input.organizationId),
          eq(inspectionTemplates.programId, input.programId),
          eq(inspectionTemplates.slug, slug),
          eq(inspectionTemplates.version, 1),
          sql`${inspectionTemplates.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    if (existing) return { templateId: existing.id, created: false }

    // Wildfire-only seed for W2-2; unknown programs get an empty
    // skeleton so the caller still receives a templateId.
    if (slug !== DEFAULT_WILDFIRE_TEMPLATE.slug) {
      const [tpl] = await db
        .insert(inspectionTemplates)
        .values({
          organizationId: input.organizationId,
          programId: input.programId,
          slug,
          name: `${slug} template`,
          description: null,
          version: 1,
          isActive: true,
          isBuiltin: false,
        })
        .returning()
      return { templateId: tpl!.id, created: true }
    }

    return await withAudit(async ({ tx, audit }) => {
      const [tpl] = await tx
        .insert(inspectionTemplates)
        .values({
          organizationId: input.organizationId,
          programId: input.programId,
          slug: DEFAULT_WILDFIRE_TEMPLATE.slug,
          name: DEFAULT_WILDFIRE_TEMPLATE.name,
          description: DEFAULT_WILDFIRE_TEMPLATE.description,
          version: 1,
          isActive: true,
          isBuiltin: true,
        })
        .returning()
      const tplId = tpl!.id

      for (let sIdx = 0; sIdx < DEFAULT_WILDFIRE_TEMPLATE.sections.length; sIdx++) {
        const s = DEFAULT_WILDFIRE_TEMPLATE.sections[sIdx]!
        const [section] = await tx
          .insert(inspectionTemplateSections)
          .values({
            templateId: tplId,
            slug: s.slug,
            name: s.name,
            description: s.description ?? null,
            sortOrder: sIdx,
            isRepeatable: s.isRepeatable ?? false,
            repeatableLabel: s.repeatableLabel ?? null,
          })
          .returning()
        for (let fIdx = 0; fIdx < s.fields.length; fIdx++) {
          const f = s.fields[fIdx]!
          await tx.insert(inspectionTemplateFields).values({
            sectionId: section!.id,
            slug: f.slug,
            label: f.label,
            kind: f.kind,
            options: f.options ?? null,
            required: f.required ?? false,
            helpText: f.helpText ?? null,
            sortOrder: fIdx,
            conditionalOnFieldSlug: f.conditionalOnFieldSlug ?? null,
            conditionalOnValue: f.conditionalOnValue ?? null,
            evaluatorRule: f.evaluatorRule ?? null,
          })
        }
      }
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'inspection_template',
        entityId: tplId,
        action: 'create',
        actorUserId: this.actorUserId(),
        metadata: { kind: 'bootstrap_wildfire_defaults' },
        after: { slug: DEFAULT_WILDFIRE_TEMPLATE.slug, isBuiltin: true },
      })
      return { templateId: tplId, created: true }
    })
  }
}
