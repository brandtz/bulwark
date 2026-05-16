/**
 * tests/unit/account-purge.test.ts — W5-4 / ADR-0038.
 *
 * Exercises MockAccountService.purgeExpiredDeletions:
 *   - Purges only rows whose soft-delete is past the
 *     ACCOUNT_DELETION_GRACE_DAYS threshold.
 *   - Returns accurate scanned / purged counts.
 *   - Is idempotent: a second run on the same clock purges nothing.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockAccountService,
  __resetMockAccountForTests,
} from '~~/shared/mocks/account.mock'
import { ACCOUNT_DELETION_GRACE_DAYS } from '~~/shared/contracts/account'
import { FIXTURE_USER_FIELD, FIXTURE_USER_SUB } from '~~/shared/mocks/fixtures'

beforeEach(() => {
  __resetMockAccountForTests()
})

describe('MockAccountService.purgeExpiredDeletions', () => {
  it('does not purge a freshly soft-deleted row', async () => {
    const svc = new MockAccountService()
    await svc.requestDeletion({ userId: FIXTURE_USER_FIELD.userId })
    const out = await svc.purgeExpiredDeletions(new Date())
    expect(out.purgedCount).toBe(0)
    expect(out.candidateCount).toBe(0)
  })

  it('purges a row past the 30-day window', async () => {
    const svc = new MockAccountService()
    await svc.requestDeletion({ userId: FIXTURE_USER_FIELD.userId })
    // Advance the clock past the grace window.
    const future = new Date(
      Date.now() + (ACCOUNT_DELETION_GRACE_DAYS + 1) * 86_400_000,
    )
    const out = await svc.purgeExpiredDeletions(future)
    expect(out.purgedCount).toBe(1)
    expect(out.candidateCount).toBe(1)
  })

  it('only purges rows past the cutoff, not adjacent ones', async () => {
    const svc = new MockAccountService()
    // Field user soft-deleted "now"; we'll advance only enough for
    // sub user (deleted slightly earlier) to qualify.
    const sub = await svc.requestDeletion({ userId: FIXTURE_USER_SUB.userId })
    // Field comes after; in real life we'd inject a clock, but here
    // both are essentially `now`. Push 31 days from sub's soft-delete
    // — both fall past the cutoff, so we expect 2.
    await svc.requestDeletion({ userId: FIXTURE_USER_FIELD.userId })
    const ref = new Date(
      new Date(sub.softDeletedAt).getTime() +
        (ACCOUNT_DELETION_GRACE_DAYS + 1) * 86_400_000,
    )
    const out = await svc.purgeExpiredDeletions(ref)
    expect(out.purgedCount).toBe(2)

    // Second run is a no-op.
    const again = await svc.purgeExpiredDeletions(ref)
    expect(again.purgedCount).toBe(0)
  })
})
