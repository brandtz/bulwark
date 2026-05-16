/**
 * app/composables/contact-homeowner-invite-helpers.ts — pure
 * decision: can this contact be invited to the homeowner portal?
 * (W4-1 / EH-O).
 *
 * Decisions:
 *   - Four states: `enabled` (button live), `pending` (already
 *     invited, not yet accepted), `accepted` (already a member), and
 *     `no-email` (contact lacks an email address). Encoded as a
 *     discriminated string so the template can switch and tests can
 *     assert.
 *   - Matching key is the contact's email (case-insensitive). The
 *     property-level membership list is small; linear scan is fine.
 */
import type { HomeownerUser } from '~~/shared/contracts/homeowner'

export type ContactInviteState = 'enabled' | 'pending' | 'accepted' | 'no-email'

export interface ContactLike {
  email: string | null
}

export function canInviteHomeowner(
  contact: ContactLike,
  memberships: readonly HomeownerUser[],
): ContactInviteState {
  if (!contact.email) return 'no-email'
  const needle = contact.email.toLowerCase()
  const match = memberships.find((m) => m.email.toLowerCase() === needle)
  if (!match) return 'enabled'
  return match.acceptedAt ? 'accepted' : 'pending'
}
