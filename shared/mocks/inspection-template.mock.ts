/**
 * shared/mocks/inspection-template.mock.ts — in-memory
 * InspectionTemplateService (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0004, ADR-0008, ADR-0019)
 *   - Module-level arrays so the singleton factory shares mutation
 *     state across the request — same pattern as MockProgramService.
 *   - Tenant firewall (E2-S7) on every method.
 *   - `bootstrap()` seeds the wildfire template idempotently. We key
 *     "is this already bootstrapped?" on `(orgId, programId, slug,
 *     version=1)` so re-running the seed is a no-op AND a freshly-
 *     created org gets the template the moment a program references it.
 *   - We deliberately keep `addSection`/`addField` cheap: they don't
 *     bump template version. Per W2-2 contract, version-bumping is the
 *     job of a future "publish" flow (likely Wave 4) — until then, the
 *     wildfire builtin lives at version=1 and edits mutate in place.
 *
 * # Decision cast down
 *   - Mutating Zod-validated rows. We bypass `.parse()` on the seed
 *     because mock fixture IDs aren't RFC 4122 (same lesson as
 *     program.mock.ts).
 */
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
} from '../contracts/inspection-template'
import { DEFAULT_WILDFIRE_TEMPLATE } from '../inspection-templates/wildfire-defaults'
import { assertSameTenant, type TenantResolver } from './tenant'

const NOW = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

const templates: InspectionTemplate[] = []
const sections: InspectionTemplateSection[] = []
const fields: InspectionTemplateField[] = []

/** Test-only: wipes the in-memory arrays. Production code never calls. */
export function __resetMockInspectionTemplateState(): void {
  templates.length = 0
  sections.length = 0
  fields.length = 0
}

export class MockInspectionTemplateService implements IInspectionTemplateService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: InspectionTemplateListInput): Promise<InspectionTemplateListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = templates.filter(
      (t) => t.organizationId === input.organizationId && !t.deletedAt,
    )
    if (input.programId !== undefined) {
      scoped = scoped.filter((t) => t.programId === input.programId)
    }
    if (!input.includeInactive) scoped = scoped.filter((t) => t.isActive)
    scoped = scoped.slice().sort((a, b) => a.name.localeCompare(b.name))
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total: scoped.length,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<InspectionTemplate | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const t = templates.find((x) => x.id === id && x.organizationId === organizationId)
    return t && !t.deletedAt ? t : null
  }

  async getWithSections(
    id: string,
    organizationId: string,
  ): Promise<InspectionTemplateWithSections | null> {
    const t = await this.get(id, organizationId)
    if (!t) return null
    const tSections = sections
      .filter((s) => s.templateId === t.id)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        ...s,
        fields: fields
          .filter((f) => f.sectionId === s.id)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))
    return { ...t, sections: tSections }
  }

  async create(input: InspectionTemplateCreateInput): Promise<InspectionTemplate> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const dup = templates.find(
      (t) =>
        t.organizationId === input.organizationId &&
        t.programId === (input.programId ?? null) &&
        t.slug === input.slug &&
        t.version === 1 &&
        !t.deletedAt,
    )
    if (dup) throw new Error(`Template slug already exists: ${input.slug}`)
    const row: InspectionTemplate = {
      id: newId(),
      organizationId: input.organizationId,
      programId: input.programId ?? null,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      version: 1,
      isActive: true,
      isBuiltin: false,
      createdAt: NOW(),
      updatedAt: NOW(),
      deletedAt: null,
    }
    templates.push(row)
    return row
  }

  async update(input: InspectionTemplateUpdateInput): Promise<InspectionTemplate> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const t = templates.find(
      (x) => x.id === input.id && x.organizationId === input.organizationId && !x.deletedAt,
    )
    if (!t) throw new Error('Template not found')
    if (input.name !== undefined) t.name = input.name
    if (input.description !== undefined) t.description = input.description ?? null
    if (input.isActive !== undefined) t.isActive = input.isActive
    t.updatedAt = NOW()
    return t
  }

  async addSection(input: SectionAddInput): Promise<InspectionTemplateSection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const t = templates.find((x) => x.id === input.templateId && x.organizationId === input.organizationId)
    if (!t) throw new Error('Template not found')
    const sortOrder = input.sortOrder ?? sections.filter((s) => s.templateId === t.id).length
    const row: InspectionTemplateSection = {
      id: newId(),
      templateId: t.id,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      sortOrder,
      isRepeatable: input.isRepeatable ?? false,
      repeatableLabel: input.repeatableLabel ?? null,
      conditionalOnFieldSlug: input.conditionalOnFieldSlug ?? null,
      conditionalOnValue: input.conditionalOnValue ?? null,
      createdAt: NOW(),
      updatedAt: NOW(),
      deletedAt: null,
    }
    sections.push(row)
    return row
  }

  async addField(input: FieldAddInput): Promise<InspectionTemplateField> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const s = sections.find((x) => x.id === input.sectionId)
    if (!s) throw new Error('Section not found')
    const sortOrder = input.sortOrder ?? fields.filter((f) => f.sectionId === s.id).length
    const row: InspectionTemplateField = {
      id: newId(),
      sectionId: s.id,
      slug: input.slug,
      label: input.label,
      kind: input.kind,
      options: input.options ?? null,
      required: input.required ?? false,
      defaultValue: input.defaultValue ?? null,
      validationJson: input.validationJson ?? null,
      helpText: input.helpText ?? null,
      placeholder: input.placeholder ?? null,
      sortOrder,
      conditionalOnFieldSlug: input.conditionalOnFieldSlug ?? null,
      conditionalOnValue: input.conditionalOnValue ?? null,
      evaluatorRule: input.evaluatorRule ?? null,
      createdAt: NOW(),
      updatedAt: NOW(),
      deletedAt: null,
    }
    fields.push(row)
    return row
  }

  async updateField(input: FieldUpdateInput): Promise<InspectionTemplateField> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const f = fields.find((x) => x.id === input.fieldId)
    if (!f) throw new Error('Field not found')
    if (input.label !== undefined) f.label = input.label
    if (input.kind !== undefined) f.kind = input.kind
    if (input.options !== undefined) f.options = input.options ?? null
    if (input.required !== undefined) f.required = input.required
    if (input.defaultValue !== undefined) f.defaultValue = input.defaultValue ?? null
    if (input.validationJson !== undefined) f.validationJson = input.validationJson ?? null
    if (input.helpText !== undefined) f.helpText = input.helpText ?? null
    if (input.placeholder !== undefined) f.placeholder = input.placeholder ?? null
    if (input.sortOrder !== undefined) f.sortOrder = input.sortOrder
    if (input.conditionalOnFieldSlug !== undefined) f.conditionalOnFieldSlug = input.conditionalOnFieldSlug ?? null
    if (input.conditionalOnValue !== undefined) f.conditionalOnValue = input.conditionalOnValue ?? null
    if (input.evaluatorRule !== undefined) f.evaluatorRule = input.evaluatorRule ?? null
    f.updatedAt = NOW()
    return f
  }

  async deleteField(input: { organizationId: string; fieldId: string }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const idx = fields.findIndex((f) => f.id === input.fieldId)
    if (idx >= 0) fields.splice(idx, 1)
  }

  async deleteSection(input: { organizationId: string; sectionId: string }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Cascade fields. Cheaper than enforcing FKs in the mock.
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i]!.sectionId === input.sectionId) fields.splice(i, 1)
    }
    const idx = sections.findIndex((s) => s.id === input.sectionId)
    if (idx >= 0) sections.splice(idx, 1)
  }

  async activate(input: { organizationId: string; templateId: string; isActive: boolean }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const t = templates.find((x) => x.id === input.templateId && x.organizationId === input.organizationId)
    if (!t) throw new Error('Template not found')
    t.isActive = input.isActive
    t.updatedAt = NOW()
  }

  async bootstrap(input: {
    organizationId: string
    programId: string
    programSlug: string
  }): Promise<{ templateId: string; created: boolean }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Use the program's slug as the template slug too (one-to-one for
    // wildfire). Future programs may map to multiple templates; that's
    // outside W2-2's scope.
    const slug = input.programSlug
    const existing = templates.find(
      (t) =>
        t.organizationId === input.organizationId &&
        t.programId === input.programId &&
        t.slug === slug &&
        t.version === 1 &&
        !t.deletedAt,
    )
    if (existing) return { templateId: existing.id, created: false }

    // Only the wildfire program has a built-in seed in W2-2.
    if (slug !== DEFAULT_WILDFIRE_TEMPLATE.slug) {
      // Unknown program: create an empty template skeleton so the caller
      // gets back a valid templateId.
      const tpl: InspectionTemplate = {
        id: newId(),
        organizationId: input.organizationId,
        programId: input.programId,
        slug,
        name: `${slug} template`,
        description: null,
        version: 1,
        isActive: true,
        isBuiltin: false,
        createdAt: NOW(),
        updatedAt: NOW(),
        deletedAt: null,
      }
      templates.push(tpl)
      return { templateId: tpl.id, created: true }
    }

    const tpl: InspectionTemplate = {
      id: newId(),
      organizationId: input.organizationId,
      programId: input.programId,
      slug: DEFAULT_WILDFIRE_TEMPLATE.slug,
      name: DEFAULT_WILDFIRE_TEMPLATE.name,
      description: DEFAULT_WILDFIRE_TEMPLATE.description,
      version: 1,
      isActive: true,
      isBuiltin: true,
      createdAt: NOW(),
      updatedAt: NOW(),
      deletedAt: null,
    }
    templates.push(tpl)

    DEFAULT_WILDFIRE_TEMPLATE.sections.forEach((s, sIdx) => {
      const section: InspectionTemplateSection = {
        id: newId(),
        templateId: tpl.id,
        slug: s.slug,
        name: s.name,
        description: s.description ?? null,
        sortOrder: sIdx,
        isRepeatable: s.isRepeatable ?? false,
        repeatableLabel: s.repeatableLabel ?? null,
        conditionalOnFieldSlug: null,
        conditionalOnValue: null,
        createdAt: NOW(),
        updatedAt: NOW(),
        deletedAt: null,
      }
      sections.push(section)
      s.fields.forEach((f, fIdx) => {
        fields.push({
          id: newId(),
          sectionId: section.id,
          slug: f.slug,
          label: f.label,
          kind: f.kind,
          options: f.options ?? null,
          required: f.required ?? false,
          defaultValue: null,
          validationJson: null,
          helpText: f.helpText ?? null,
          placeholder: null,
          sortOrder: fIdx,
          conditionalOnFieldSlug: f.conditionalOnFieldSlug ?? null,
          conditionalOnValue: f.conditionalOnValue ?? null,
          evaluatorRule: f.evaluatorRule ?? null,
          createdAt: NOW(),
          updatedAt: NOW(),
          deletedAt: null,
        })
      })
    })

    return { templateId: tpl.id, created: true }
  }
}
