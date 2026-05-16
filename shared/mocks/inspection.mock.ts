/**
 * shared/mocks/inspection.mock.ts — in-memory InspectionService
 * (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Decisions (ADR-0004, ADR-0008, ADR-0019)
 *   - Module-level arrays mirror the rest of the mock suite.
 *   - `evaluate()` defers to the pure
 *     `shared/utils/inspection-evaluator.ts`; the mock only loads the
 *     template + responses and forwards them in. Means the unit tests
 *     can exercise the same code path the runtime does.
 *   - `saveResponses` is upsert-by-(inspectionId, instanceKey, slug).
 *     Submitting the same key twice updates in place — matches the DB
 *     unique constraint on the real table.
 *   - We accept a `templateProvider` so we can look up the template by
 *     id+version without importing the sibling service directly
 *     (avoids a singleton-ordering hazard in the factory).
 */
import type {
  IInspectionService,
  Inspection,
  InspectionCreateInput,
  InspectionIssue,
  InspectionListInput,
  InspectionListOutput,
  InspectionResponse,
  InspectionSignInput,
  InspectionWithResponses,
  SaveResponsesInput,
} from '../contracts/inspection'
import type { InspectionTemplateWithSections } from '../contracts/inspection-template'
import { evaluateInspection } from '../utils/inspection-evaluator'
import { assertSameTenant, type TenantResolver } from './tenant'

const NOW = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

const inspections: Inspection[] = []
const responses: InspectionResponse[] = []

export function __resetMockInspectionState(): void {
  inspections.length = 0
  responses.length = 0
}

type TemplateProvider = (
  templateId: string,
  organizationId: string,
  version?: number,
) => Promise<InspectionTemplateWithSections | null>

export class MockInspectionService implements IInspectionService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly templateProvider?: TemplateProvider,
  ) {}

  async list(input: InspectionListInput): Promise<InspectionListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = inspections.filter(
      (i) => i.organizationId === input.organizationId && !i.deletedAt,
    )
    if (input.propertyId) scoped = scoped.filter((i) => i.propertyId === input.propertyId)
    if (input.status) scoped = scoped.filter((i) => i.status === input.status)
    scoped = scoped.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total: scoped.length,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Inspection | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const i = inspections.find((x) => x.id === id && x.organizationId === organizationId)
    return i && !i.deletedAt ? i : null
  }

  async getWithResponses(
    id: string,
    organizationId: string,
  ): Promise<InspectionWithResponses | null> {
    const i = await this.get(id, organizationId)
    if (!i) return null
    return {
      ...i,
      responses: responses.filter((r) => r.inspectionId === i.id),
    }
  }

  async create(input: InspectionCreateInput): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row: Inspection = {
      id: newId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      buildingId: input.buildingId ?? null,
      templateId: input.templateId,
      templateVersion: 1,
      programId: input.programId ?? null,
      inspectorUserId: input.inspectorUserId ?? null,
      startedAt: NOW(),
      submittedAt: null,
      signedAt: null,
      signedByName: null,
      signatureUrl: null,
      status: 'draft',
      summary: null,
      createdAt: NOW(),
      updatedAt: NOW(),
      deletedAt: null,
    }
    inspections.push(row)
    return row
  }

  async saveResponses(input: SaveResponsesInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const i = inspections.find(
      (x) => x.id === input.inspectionId && x.organizationId === input.organizationId,
    )
    if (!i) throw new Error('Inspection not found')
    if (i.status !== 'draft') throw new Error('Inspection is no longer editable')
    for (const r of input.responses) {
      const existing = responses.find(
        (x) =>
          x.inspectionId === i.id &&
          x.sectionInstanceKey === r.sectionInstanceKey &&
          x.fieldSlug === r.fieldSlug,
      )
      if (existing) {
        existing.valueJson = r.valueJson ?? null
        existing.photosCount = r.photosCount ?? 0
        existing.notes = r.notes ?? null
        existing.updatedAt = NOW()
      } else {
        responses.push({
          id: newId(),
          inspectionId: i.id,
          sectionInstanceKey: r.sectionInstanceKey,
          fieldSlug: r.fieldSlug,
          valueJson: r.valueJson ?? null,
          photosCount: r.photosCount ?? 0,
          notes: r.notes ?? null,
          createdAt: NOW(),
          updatedAt: NOW(),
          deletedAt: null,
        })
      }
    }
    i.updatedAt = NOW()
  }

  async submit(input: { organizationId: string; inspectionId: string }): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const i = inspections.find(
      (x) => x.id === input.inspectionId && x.organizationId === input.organizationId,
    )
    if (!i) throw new Error('Inspection not found')
    if (i.status === 'draft') {
      i.status = 'submitted'
      i.submittedAt = NOW()
      i.updatedAt = i.submittedAt
    }
    return i
  }

  async sign(input: InspectionSignInput): Promise<Inspection> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const i = inspections.find(
      (x) => x.id === input.inspectionId && x.organizationId === input.organizationId,
    )
    if (!i) throw new Error('Inspection not found')
    if (i.status === 'draft') {
      i.status = 'submitted'
      i.submittedAt = NOW()
    }
    i.status = 'signed'
    i.signedAt = NOW()
    i.signedByName = input.signedByName
    i.signatureUrl = input.signatureDataUrl
    i.updatedAt = i.signedAt
    return i
  }

  async evaluate(input: {
    organizationId: string
    inspectionId: string
  }): Promise<{ issues: InspectionIssue[] }> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const i = inspections.find(
      (x) => x.id === input.inspectionId && x.organizationId === input.organizationId,
    )
    if (!i) throw new Error('Inspection not found')
    if (!this.templateProvider) return { issues: [] }
    const template = await this.templateProvider(i.templateId, i.organizationId, i.templateVersion)
    if (!template) return { issues: [] }
    const myResponses = responses.filter((r) => r.inspectionId === i.id)
    return { issues: evaluateInspection(template, myResponses) }
  }
}
