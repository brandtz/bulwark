/**
 * server/utils/security-enforcement.ts — per-request enforcement of the
 * organization security policy for RPC calls (WP-L07 S2, ADR-0006).
 *
 * # Decisions
 *   - Idle timeout: the sealed session carries `lastSeenAt`. A call after more
 *     than `idleMinutes` of inactivity clears the session and fails with 401.
 *     Activity is refreshed at most once a minute (each refresh re-seals the
 *     cookie). Background polling (PASSIVE) is checked but never counts as
 *     activity, otherwise an open tab would never time out.
 *   - MFA required: a member without a confirmed authenticator can only reach
 *     sign-in, MFA enrolment and the calls the shell needs to render until
 *     they enrol (MFA_SETUP_ALLOWED); everything else is 403.
 *   - Pure decision functions are exported for unit tests.
 */
import type { SecurityPolicy } from '../../shared/contracts/security-policy'
import { isMfaEnrolled, loadSecurityPolicy } from '../services/security-policy.real'
import { sessionWriteConfig, type SessionUserShape } from './services-factory'

type Event = Parameters<typeof clearUserSession>[0]

const ACTIVITY_REFRESH_MS = 60_000

/** Background polling: checked for expiry, never extends the session. */
export const PASSIVE = new Set(['notification.unreadCountForUser'])

/** Reachable while MFA enrolment is required but not done. */
export const MFA_SETUP_ALLOWED = new Set([
  'auth.currentUser', 'auth.logout', 'auth.switchActiveOrg', 'auth.changePassword',
  'mfa.getStatus', 'mfa.setupTotp', 'mfa.confirmTotp', 'mfa.generateBackupCodes',
  // An admin who switched MFA to required before enrolling can still review or revert it
  // (the RPC role policy keeps these admin-only).
  'securityPolicy.get', 'securityPolicy.update', 'securityPolicy.mfaRoster',
  'securityPolicy.getMine', 'themePreferences.getCurrent', 'themePreferences.updateCurrent',
  'label.list', 'label.getMap', 'label.getBranding', 'featureFlag.listForOrg', 'featureFlag.get',
  'notification.unreadCountForUser',
])

export type IdleDecision = 'ok' | 'refresh' | 'expired'

export function idleDecision(lastSeenAt: number | undefined, idleMinutes: number | null, now: number, passive: boolean): IdleDecision {
  if (idleMinutes && lastSeenAt && now - lastSeenAt > idleMinutes * 60_000) return 'expired'
  if (passive) return 'ok'
  if (!lastSeenAt || now - lastSeenAt >= ACTIVITY_REFRESH_MS) return 'refresh'
  return 'ok'
}

export function mfaGateBlocks(policy: Pick<SecurityPolicy, 'mfaMode'>, enrolled: boolean, key: string): boolean {
  return policy.mfaMode === 'required' && !enrolled && !MFA_SETUP_ALLOWED.has(key)
}

/**
 * Applies idle timeout and the MFA gate for a signed-in caller. Throws an H3
 * error (401 idle, 403 MFA) when the call must not proceed. For public methods
 * (login, currentUser, ...) an idle-expired session is cleared silently so the
 * method runs as signed out — re-login must never be blocked.
 */
export async function enforceSecurityPolicy(
  event: Event,
  key: string,
  session: { userId: string, activeOrganizationId: string },
  opts: { publicMethod?: boolean } = {},
): Promise<void> {
  const policy = await loadSecurityPolicy(session.activeOrganizationId)

  const stored = (await getUserSession(event)).user as SessionUserShape | undefined
  if (stored?.userId) {
    const decision = idleDecision(stored.lastSeenAt, policy.idleMinutes, Date.now(), PASSIVE.has(key) || !!opts.publicMethod)
    if (decision === 'expired') {
      await clearUserSession(event)
      if (opts.publicMethod) return
      throw createError({ statusCode: 401, statusMessage: 'Session expired due to inactivity' })
    }
    if (decision === 'refresh') {
      const next: SessionUserShape = { ...stored, lastSeenAt: Date.now() }
      await setUserSession(event, { user: next }, sessionWriteConfig(next))
    }
  }

  if (!opts.publicMethod && policy.mfaMode === 'required' && !MFA_SETUP_ALLOWED.has(key)) {
    if (mfaGateBlocks(policy, await isMfaEnrolled(session.userId), key)) {
      throw createError({ statusCode: 403, statusMessage: 'MFA enrollment required by your organization' })
    }
  }
}
