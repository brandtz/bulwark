/**
 * shared/mocks/job.mock.ts — MockJobService (E7-S1).
 *
 * # Decisions (ADR-0008)
 *   - In-memory job queue. Each `create()` schedules a deterministic
 *     transition: `queued` → (after `runAfterMs`) `running` → (after
 *     `completeAfterMs`) `succeeded` (or `failed` when the payload
 *     opts in via `__mockFail: true`).
 *   - Timing is driven by `setTimeout` so that real wall-clock UI
 *     spinners look right in dev. Tests use `vi.useFakeTimers()` to
 *     advance time deterministically.
 *   - Tenant firewall on every method (E2-S7).
 *   - `runAfterMs` and `completeAfterMs` are constants on the class so
 *     consumers (preview pages, tests) can tweak them via instance
 *     overrides if a future story needs a different cadence. Default
 *     2s succeeded matches the always-async demo target (TECH §9).
 *
 * # Decision cast down
 *   - Rejected: a `tick(now)` test-only method that pushes the queue
 *     forward without timers. Tempting, but every test already uses
 *     fake timers for predictable polling assertions; doubling the
 *     surface confuses the contract.
 *   - Rejected: persisting jobs across `__resetMockServicesForTests`.
 *     Tests want a clean slate per case; the factory reset already
 *     drops the singleton (and the rows array with it).
 */
import type {
  IJobService,
  Job,
  JobCreateInput,
} from '../contracts/job'
import { isTerminalJobStatus } from '../contracts/job'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: Job[] = []

let nextId = 1
function newJobId(): string {
  // Mock-only id. Not RFC4122 — same pattern as fixtures (E3-S4 lesson).
  const seq = String(nextId++).padStart(8, '0')
  return `mockjob-${seq}-0000-0000-000000000000`
}

export interface MockJobServiceOptions {
  /** Delay between create→running. */
  runAfterMs?: number
  /** Delay between running→terminal. */
  completeAfterMs?: number
  /** Override the URL stamped on success. */
  successUrl?: string
}

export class MockJobService implements IJobService {
  public readonly runAfterMs: number
  public readonly completeAfterMs: number
  public readonly successUrl: string

  constructor(
    private readonly tenantResolver?: TenantResolver,
    opts: MockJobServiceOptions = {},
  ) {
    this.runAfterMs = opts.runAfterMs ?? 250
    this.completeAfterMs = opts.completeAfterMs ?? 2000
    this.successUrl = opts.successUrl ?? 'https://r2.mock/bulwark/preview.pdf'
  }

  async create(input: JobCreateInput): Promise<Job> {
    assertSameTenant(this.tenantResolver, input.organizationId)

    const now = new Date().toISOString()
    const job: Job = {
      id: newJobId(),
      organizationId: input.organizationId,
      kind: input.kind,
      status: 'queued',
      payload: input.payload ?? {},
      resultUrl: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(job)

    // Schedule queued → running.
    setTimeout(() => {
      const idx = rows.findIndex((r) => r.id === job.id)
      if (idx === -1) return
      rows[idx] = {
        ...rows[idx]!,
        status: 'running',
        updatedAt: new Date().toISOString(),
      }

      // Schedule running → terminal.
      setTimeout(() => {
        const j = rows.findIndex((r) => r.id === job.id)
        if (j === -1) return
        const current = rows[j]!
        // Test-only opt-in: payload.__mockFail flips the terminal state.
        const shouldFail = current.payload['__mockFail'] === true
        rows[j] = shouldFail
          ? {
              ...current,
              status: 'failed',
              error: 'Mock failure (payload.__mockFail set).',
              updatedAt: new Date().toISOString(),
            }
          : {
              ...current,
              status: 'succeeded',
              resultUrl: this.successUrl,
              updatedAt: new Date().toISOString(),
            }
      }, this.completeAfterMs)
    }, this.runAfterMs)

    return job
  }

  async get(id: string, organizationId: string): Promise<Job | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find(
      (x) =>
        x.id === id && x.organizationId === organizationId && !x.deletedAt,
    )
    return r ?? null
  }
}

/**
 * Test-only escape hatch: drains the queue. Production never calls this.
 * Useful when a test wants to start fresh without re-creating the factory.
 */
export function __resetMockJobsForTests(): void {
  rows.length = 0
  nextId = 1
}

export { isTerminalJobStatus }
