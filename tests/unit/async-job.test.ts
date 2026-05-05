/**
 * tests/unit/async-job.test.ts — E7-S1 acceptance proof.
 *
 * # Decisions (ADR-0008)
 *   - Two surfaces under test: MockJobService (queued → running →
 *     terminal cadence + tenant firewall) and pollUntilTerminal (the
 *     pure polling helper). Both are exercised with `vi.useFakeTimers`
 *     so the 2-second wall-clock cadence runs in microseconds.
 *   - We pass an injected `sleep` to pollUntilTerminal that yields to
 *     the timer queue via `setTimeout(0)` so we can interleave
 *     `vi.advanceTimersByTimeAsync` with the polling loop. Avoids the
 *     real-timer flake that comes from `await sleep(...)` in fake mode.
 *
 * # Decision cast down
 *   - Rejected: testing the real Vue composable. That ships in E7-S2.
 *     The pure helper is the unit of behavior here.
 *   - Rejected: per-status assertion via onTick. We assert the final
 *     row state; intermediate ticks are an implementation detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MockJobService,
  __resetMockJobsForTests,
} from '~~/shared/mocks/job.mock'
import { pollUntilTerminal } from '~~/shared/utils/asyncJob'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'

const adminCtx: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

describe('Async job pattern (E7-S1)', () => {
  beforeEach(() => {
    __resetMockJobsForTests()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a job in queued state with a stable id', async () => {
    const svc = new MockJobService(adminCtx, {
      runAfterMs: 100,
      completeAfterMs: 500,
    })
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: { propertyId: 'prop-1' },
    })
    expect(job.status).toBe('queued')
    expect(job.id).toMatch(/^mockjob-/)
    expect(job.kind).toBe('compliance_doc')
    expect(job.resultUrl).toBeNull()
    expect(job.error).toBeNull()
  })

  it('transitions queued → running → succeeded on the configured cadence', async () => {
    const svc = new MockJobService(adminCtx, {
      runAfterMs: 100,
      completeAfterMs: 500,
    })
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: {},
    })

    // Tick 0: still queued.
    let row = await svc.get(job.id, FIXTURE_ORG_ID)
    expect(row?.status).toBe('queued')

    // After runAfterMs: running.
    await vi.advanceTimersByTimeAsync(100)
    row = await svc.get(job.id, FIXTURE_ORG_ID)
    expect(row?.status).toBe('running')
    expect(row?.resultUrl).toBeNull()

    // After completeAfterMs more: succeeded with resultUrl.
    await vi.advanceTimersByTimeAsync(500)
    row = await svc.get(job.id, FIXTURE_ORG_ID)
    expect(row?.status).toBe('succeeded')
    expect(row?.resultUrl).toMatch(/^https?:\/\//)
    expect(row?.error).toBeNull()
  })

  it('transitions to failed when payload.__mockFail is set', async () => {
    const svc = new MockJobService(adminCtx, {
      runAfterMs: 0,
      completeAfterMs: 100,
    })
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: { __mockFail: true },
    })
    await vi.advanceTimersByTimeAsync(100)
    const row = await svc.get(job.id, FIXTURE_ORG_ID)
    expect(row?.status).toBe('failed')
    expect(row?.error).toContain('Mock failure')
    expect(row?.resultUrl).toBeNull()
  })

  it('rejects cross-tenant create + get', async () => {
    const svc = new MockJobService(adminCtx)
    await expect(
      svc.create({
        organizationId: FIXTURE_ORG_ID_2,
        kind: 'compliance_doc',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(TenantViolationError)

    // Create one legitimately so we have an id to query against.
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: {},
    })
    await expect(
      svc.get(job.id, FIXTURE_ORG_ID_2),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it('pollUntilTerminal resolves with the final job row', async () => {
    const svc = new MockJobService(adminCtx, {
      runAfterMs: 50,
      completeAfterMs: 100,
    })
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: {},
    })

    // Default sleep uses setTimeout, which fake timers control.
    const pollPromise = pollUntilTerminal(
      () => svc.get(job.id, FIXTURE_ORG_ID),
      { intervalMs: 25 },
    )

    // Advance well past the runAfter + completeAfter window. Each tick
    // of the loop awaits a 25ms sleep, so 300ms covers ~12 polling
    // iterations — more than enough for the 50+100ms transition.
    await vi.advanceTimersByTimeAsync(300)

    const final = await pollPromise
    expect(final.status).toBe('succeeded')
    expect(final.resultUrl).toMatch(/^https?:\/\//)
  })

  it('pollUntilTerminal throws when the job is missing on first fetch', async () => {
    const svc = new MockJobService(adminCtx)
    await expect(
      pollUntilTerminal(() => svc.get('nope-not-a-real-id', FIXTURE_ORG_ID), {
        intervalMs: 10,
      }),
    ).rejects.toThrow('Job not found')
  })

  it('pollUntilTerminal returns immediately when job is already terminal', async () => {
    const svc = new MockJobService(adminCtx, {
      runAfterMs: 0,
      completeAfterMs: 0,
    })
    const job = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      kind: 'compliance_doc',
      payload: {},
    })
    // Drive both transitions in one shot.
    await vi.advanceTimersByTimeAsync(10)

    const final = await pollUntilTerminal(
      () => svc.get(job.id, FIXTURE_ORG_ID),
      { intervalMs: 100 },
    )
    expect(final.status).toBe('succeeded')
  })
})
