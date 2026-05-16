/**
 * tests/unit/account-export.test.ts — W5-4 / ADR-0038.
 *
 * Exercises MockAccountService.exportPersonalData:
 *   - Returns the requesting user's own profile + memberships
 *     + notifications + audit events.
 *   - Excludes audit events authored by OTHER users.
 *   - Includes a notice string referencing the redaction policy.
 *   - Shapes match the Zod schema (parse round-trip).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockAccountService,
  __resetMockAccountForTests,
} from '~~/shared/mocks/account.mock'
import {
  AccountExportSchema,
  REDACTED_ACTOR,
} from '~~/shared/contracts/account'
import {
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUPER,
} from '~~/shared/mocks/fixtures'

beforeEach(() => {
  __resetMockAccountForTests()
})

describe('MockAccountService.exportPersonalData', () => {
  it('returns the requesting user own data, redaction notice present', async () => {
    const svc = new MockAccountService()
    const out = await svc.exportPersonalData(FIXTURE_USER_FIELD.userId)
    expect(out.profile.userId).toBe(FIXTURE_USER_FIELD.userId)
    expect(out.profile.email).toBe(FIXTURE_USER_FIELD.email)
    expect(out.profile.fullName).toBe(FIXTURE_USER_FIELD.fullName)
    expect(out.memberships.length).toBeGreaterThan(0)
    expect(out.notice).toContain(REDACTED_ACTOR)
    expect(out.schemaVersion).toBe(1)
  })

  it('excludes audit events authored by OTHER users', async () => {
    const svc = new MockAccountService()
    const out = await svc.exportPersonalData(FIXTURE_USER_FIELD.userId)
    for (const ev of out.auditEvents) {
      expect(ev.actorUserId).toBe(FIXTURE_USER_FIELD.userId)
      expect(ev.actorUserId).not.toBe(FIXTURE_USER_SUPER.userId)
    }
    expect(out.auditTruncated).toBe(false)
  })

  it('payload validates against AccountExportSchema', async () => {
    const svc = new MockAccountService()
    const out = await svc.exportPersonalData(FIXTURE_USER_FIELD.userId)
    const parsed = AccountExportSchema.safeParse(out)
    expect(parsed.success).toBe(true)
  })

  it('throws on unknown user id', async () => {
    const svc = new MockAccountService()
    await expect(
      svc.exportPersonalData('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/Unknown user/)
  })
})
