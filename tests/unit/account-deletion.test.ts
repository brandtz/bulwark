/**
 * tests/unit/account-deletion.test.ts — W5-4 / ADR-0038.
 *
 * Exercises MockAccountService.requestDeletion:
 *   - Sole-admin guard blocks deletion when the user is the only
 *     org_admin of an org (FIXTURE_USER_ADMIN is sole admin of
 *     FIXTURE_ORG_ID — FIXTURE_USER_SUPER is super_admin, not org_admin).
 *   - Soft-delete succeeds for a non-admin user and flips
 *     `profile.deletedAt` + `profile.isActive=false` in a subsequent
 *     export.
 *   - Soft-delete returns a `hardDeleteScheduledFor` 30 days after
 *     `softDeletedAt`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockAccountService,
  __resetMockAccountForTests,
} from '~~/shared/mocks/account.mock'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  SoleAdminError,
} from '~~/shared/contracts/account'
import {
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
} from '~~/shared/mocks/fixtures'

beforeEach(() => {
  __resetMockAccountForTests()
})

describe('MockAccountService.requestDeletion', () => {
  it('blocks the sole org_admin', async () => {
    const svc = new MockAccountService()
    await expect(
      svc.requestDeletion({ userId: FIXTURE_USER_ADMIN.userId }),
    ).rejects.toBeInstanceOf(SoleAdminError)
  })

  it('soft-deletes a non-admin user; export reflects deletedAt + scrubbed PII', async () => {
    const svc = new MockAccountService()
    const result = await svc.requestDeletion({
      userId: FIXTURE_USER_FIELD.userId,
      reason: 'no longer needed',
    })
    expect(result.userId).toBe(FIXTURE_USER_FIELD.userId)
    expect(result.softDeletedAt).toBeTruthy()
    expect(result.hardDeleteScheduledFor).toBeTruthy()

    const grace =
      new Date(result.hardDeleteScheduledFor).getTime() -
      new Date(result.softDeletedAt).getTime()
    expect(grace).toBe(ACCOUNT_DELETION_GRACE_DAYS * 86_400_000)

    const exported = await svc.exportPersonalData(FIXTURE_USER_FIELD.userId)
    expect(exported.profile.deletedAt).not.toBeNull()
    expect(exported.profile.isActive).toBe(false)
    expect(exported.profile.fullName).toBe('')
  })

  it('is idempotent — second call returns the original softDeletedAt', async () => {
    const svc = new MockAccountService()
    const a = await svc.requestDeletion({ userId: FIXTURE_USER_FIELD.userId })
    const b = await svc.requestDeletion({ userId: FIXTURE_USER_FIELD.userId })
    expect(b.softDeletedAt).toBe(a.softDeletedAt)
  })
})
