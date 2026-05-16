/**
 * tests/unit/contact-homeowner-invite.test.ts — pure state for the
 * "Send portal invite" button on the property contacts page
 * (W4-1 / EH-O).
 */
import { describe, it, expect } from 'vitest'
import { canInviteHomeowner } from '../../app/composables/contact-homeowner-invite-helpers'
import type { HomeownerUser } from '../../shared/contracts/homeowner'

function member(over: Partial<HomeownerUser> = {}): HomeownerUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    organizationId: 'o',
    propertyId: 'p',
    userId: '00000000-0000-0000-0000-00000000aaaa',
    email: 'a@b.com',
    fullName: 'A B',
    kind: 'owner',
    invitedAt: '2025-01-01T00:00:00.000Z',
    acceptedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  } as HomeownerUser
}

describe('canInviteHomeowner', () => {
  it('returns no-email when the contact has no email', () => {
    expect(canInviteHomeowner({ email: null }, [])).toBe('no-email')
  })

  it('returns enabled when the contact email is not yet a member', () => {
    expect(canInviteHomeowner({ email: 'new@b.com' }, [member()])).toBe('enabled')
  })

  it('returns pending when an invite was sent but not accepted', () => {
    expect(
      canInviteHomeowner({ email: 'a@b.com' }, [member({ acceptedAt: null })]),
    ).toBe('pending')
  })

  it('returns accepted when the homeowner has accepted', () => {
    expect(
      canInviteHomeowner(
        { email: 'a@b.com' },
        [member({ acceptedAt: '2025-02-01T00:00:00.000Z' })],
      ),
    ).toBe('accepted')
  })

  it('matches emails case-insensitively', () => {
    expect(
      canInviteHomeowner({ email: 'A@B.COM' }, [member({ acceptedAt: null })]),
    ).toBe('pending')
  })
})
