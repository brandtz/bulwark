/**
 * tests/unit/user-admin.test.ts — W2-4 / EH-H Part B.
 *
 * Exercises MockUserService: invite mints unique tokens, revoke + setRole
 * + suspend/reactivate/deactivate state transitions all behave, and
 * transferOwnership obeys the super_admin role guard.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockUserService,
  __resetMockUsersForTests,
} from '~~/shared/mocks/user.mock'
import { TenantViolationError, type TenantResolver } from '~~/shared/mocks/tenant'
import {
  FIXTURE_ORG_ID,
  FIXTURE_ORG_ID_2,
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUPER,
} from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})
const superResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_SUPER.userId,
  organizationId: FIXTURE_ORG_ID,
})

beforeEach(() => {
  __resetMockUsersForTests()
})

describe('MockUserService.invite', () => {
  it('mints a unique invite token + URL, listed on next list()', async () => {
    const svc = new MockUserService(adminResolver)
    const r = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      email: 'new@bulwark.test',
      role: 'field',
      invitedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    expect(r.inviteId).toBeTruthy()
    expect(r.inviteToken).toBeTruthy()
    expect(r.inviteUrl).toContain(r.inviteToken)

    const r2 = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      email: 'another@bulwark.test',
      role: 'field',
      invitedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    expect(r2.inviteToken).not.toEqual(r.inviteToken)

    const { users } = await svc.list({ organizationId: FIXTURE_ORG_ID })
    const invites = users.filter((u) => u.kind === 'invite')
    expect(invites.map((i) => i.email)).toContain('new@bulwark.test')
    expect(invites.map((i) => i.email)).toContain('another@bulwark.test')
  })

  it('rejects cross-tenant invite', async () => {
    const svc = new MockUserService(adminResolver)
    await expect(
      svc.invite({
        organizationId: FIXTURE_ORG_ID_2,
        email: 'x@y.test',
        role: 'field',
        invitedByUserId: FIXTURE_USER_ADMIN.userId,
      }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })
})

describe('MockUserService.revokeInvite + resendInvite', () => {
  it('revokes an outstanding invite', async () => {
    const svc = new MockUserService(adminResolver)
    const r = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      email: 'revoke@bulwark.test',
      role: 'field',
      invitedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    await svc.revokeInvite(r.inviteId, FIXTURE_ORG_ID)
    const { users } = await svc.list({ organizationId: FIXTURE_ORG_ID })
    expect(users.some((u) => u.kind === 'invite' && u.email === 'revoke@bulwark.test')).toBe(false)
  })

  it('resends with a fresh token', async () => {
    const svc = new MockUserService(adminResolver)
    const r = await svc.invite({
      organizationId: FIXTURE_ORG_ID,
      email: 'resend@bulwark.test',
      role: 'field',
      invitedByUserId: FIXTURE_USER_ADMIN.userId,
    })
    const r2 = await svc.resendInvite(r.inviteId, FIXTURE_ORG_ID)
    expect(r2.inviteToken).not.toEqual(r.inviteToken)
  })
})

describe('MockUserService.setRole + suspend/reactivate/deactivate', () => {
  it('persists role change', async () => {
    const svc = new MockUserService(adminResolver)
    await svc.setRole({
      organizationId: FIXTURE_ORG_ID,
      userId: FIXTURE_USER_FIELD.userId,
      role: 'org_manager',
    })
    const { users } = await svc.list({ organizationId: FIXTURE_ORG_ID })
    const field = users.find((u) => u.kind === 'member' && u.id === FIXTURE_USER_FIELD.userId)
    expect(field?.role).toBe('org_manager')
  })

  it('suspend → reactivate round-trip', async () => {
    const svc = new MockUserService(adminResolver)
    await svc.suspend(FIXTURE_USER_FIELD.userId, FIXTURE_ORG_ID)
    let { users } = await svc.list({ organizationId: FIXTURE_ORG_ID })
    expect(users.find((u) => u.id === FIXTURE_USER_FIELD.userId)?.status).toBe('suspended')
    await svc.reactivate(FIXTURE_USER_FIELD.userId, FIXTURE_ORG_ID)
    ;({ users } = await svc.list({ organizationId: FIXTURE_ORG_ID }))
    expect(users.find((u) => u.id === FIXTURE_USER_FIELD.userId)?.status).toBe('active')
  })

  it('deactivate marks the user deactivated', async () => {
    const svc = new MockUserService(adminResolver)
    await svc.deactivate(FIXTURE_USER_FIELD.userId, FIXTURE_ORG_ID)
    const { users } = await svc.list({ organizationId: FIXTURE_ORG_ID })
    expect(users.find((u) => u.id === FIXTURE_USER_FIELD.userId)?.status).toBe('deactivated')
  })
})

describe('MockUserService.transferOwnership', () => {
  it('refuses non-super_admin callers', async () => {
    const svc = new MockUserService(adminResolver)
    await expect(
      svc.transferOwnership({
        organizationId: FIXTURE_ORG_ID,
        newOwnerUserId: FIXTURE_USER_FIELD.userId,
      }),
    ).rejects.toThrow()
  })

  it('allows super_admin callers', async () => {
    const svc = new MockUserService(superResolver)
    await expect(
      svc.transferOwnership({
        organizationId: FIXTURE_ORG_ID,
        newOwnerUserId: FIXTURE_USER_FIELD.userId,
      }),
    ).resolves.toBeUndefined()
  })
})
