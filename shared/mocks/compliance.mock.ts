/**
 * shared/mocks/compliance.mock.ts — MockComplianceDocService (E7-S2).
 *
 * # Decisions (ADR-0008)
 *   - Each `create()` writes the row in `generating` and immediately
 *     enqueues a `compliance_doc` job (E7-S1) capturing the snapshot
 *     payload. The doc row carries the job id so the UI can poll.
 *   - `syncFromJob()` is a pure-read reconciler: it reads the job and
 *     mirrors its terminal state onto the doc row. It is idempotent so
 *     polling can call it freely.
 *   - Tenant firewall on every method (E2-S7).
 *   - We deliberately skip `ComplianceDocSchema.parse(...)` of the
 *     stored row because seeded fixture ids elsewhere in the system
 *     are non-RFC4122 (E3-S4 lesson). We still parse the *input*.
 *
 * # Decision cast down
 *   - Rejected: storing the rendered doc body. The mock fabricates a
 *     URL via the job's `successUrl`; the real worker writes a PDF.
 *     Either way, the doc row only owns inputs + result pointer.
 */
import {
  isTerminalComplianceDocStatus,
  type ComplianceDoc,
  type ComplianceDocCreateInput,
  type ComplianceDocListInput,
  type ComplianceDocStatus,
  type IComplianceDocService,
} from '../contracts/compliance'
import type { IJobService } from '../contracts/job'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: ComplianceDoc[] = []

let nextId = 1
function newDocId(): string {
  // Mock-only id. Same non-RFC4122 pattern as other mocks (E3-S4 lesson).
  const seq = String(nextId++).padStart(8, '0')
  return `mockcdoc-${seq}-0000-0000-00000000000`
}

export class MockComplianceDocService implements IComplianceDocService {
  constructor(
    private readonly tenantResolver: TenantResolver | undefined,
    /** Closure so we can resolve the job service after the factory wires both. */
    private readonly getJobService: () => IJobService,
  ) {}

  async list(input: ComplianceDocListInput): Promise<ComplianceDoc[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return rows
      .filter(
        (r) =>
          r.organizationId === input.organizationId &&
          !r.deletedAt &&
          (input.propertyId ? r.propertyId === input.propertyId : true),
      )
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  async get(
    id: string,
    organizationId: string,
  ): Promise<ComplianceDoc | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(
      (x) =>
        x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    return r ?? null
  }

  async create(input: ComplianceDocCreateInput): Promise<ComplianceDoc> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // We deliberately skip ComplianceDocCreateInputSchema.parse here:
    // seeded fixture ids elsewhere in the system are non-RFC4122
    // (E3-S4 / E6-S5 lesson). Real backend in E11 swaps this for the
    // SQL impl which validates server-side.

    const now = new Date().toISOString()
    // Kick the async job FIRST so the row carries a real job id.
    const job = await this.getJobService().create({
      organizationId: input.organizationId,
      kind: 'compliance_doc',
      payload: {
        propertyId: input.propertyId,
        workOrderIds: input.workOrderIds,
        includedSlotIds: input.includedSlotIds,
      },
    })

    const doc: ComplianceDoc = {
      id: newDocId(),
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      workOrderIds: [...input.workOrderIds],
      includedSlotIds: [...input.includedSlotIds],
      signature: {
        ...input.signature,
        signedAt: now,
      },
      jobId: job.id,
      status: 'generating',
      resultUrl: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(doc)
    return doc
  }

  async syncFromJob(
    id: string,
    organizationId: string,
  ): Promise<ComplianceDoc> {
    assertSameTenant(this.tenantResolver, organizationId)
    const idx = rows.findIndex(
      (x) =>
        x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    if (idx === -1) {
      throw new Error(`ComplianceDoc not found: ${id}`)
    }
    const current = rows[idx]!
    if (isTerminalComplianceDocStatus(current.status)) {
      return current
    }
    if (!current.jobId) {
      return current
    }
    const job = await this.getJobService().get(current.jobId, organizationId)
    if (!job) {
      return current
    }
    let nextStatus: ComplianceDocStatus = current.status
    if (job.status === 'succeeded') nextStatus = 'ready'
    else if (job.status === 'failed') nextStatus = 'failed'
    else if (job.status === 'running') nextStatus = 'generating'

    if (
      nextStatus === current.status &&
      current.resultUrl === job.resultUrl &&
      current.error === job.error
    ) {
      return current
    }
    const updated: ComplianceDoc = {
      ...current,
      status: nextStatus,
      resultUrl: job.resultUrl,
      error: job.error,
      updatedAt: new Date().toISOString(),
    }
    rows[idx] = updated
    return updated
  }
}

/**
 * Test-only escape hatch: drains the in-memory rows. Production never
 * calls this. Useful when a test wants a clean slate without recreating
 * the factory.
 */
export function __resetMockComplianceDocsForTests(): void {
  rows.length = 0
  nextId = 1
}
