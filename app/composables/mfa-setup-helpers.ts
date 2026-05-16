/**
 * app/composables/mfa-setup-helpers.ts — pure helpers for the MFA setup
 * page (W4-1 / EH-I / ADR-0024).
 *
 * Decisions:
 *   - The enrolment flow is a small state machine. Encoding the
 *     transition rule as a pure function lets vitest assert it
 *     without booting Nuxt.
 *   - Step shape is exhaustive; TypeScript catches missing branches.
 */
import type { MfaStatus } from '~~/shared/contracts/mfa'

export type MfaSetupStep =
  | 'enrolled'      // user already has MFA enabled
  | 'idle'          // user has no MFA, no flow in progress
  | 'qr'            // setupTotp() returned; user scans QR
  | 'confirm'       // we have the secret; waiting for code
  | 'backupCodes'   // confirmed; show backup codes once

/**
 * Choose the initial step from the current MFA status. Used on page
 * mount and any time `getStatus` refreshes.
 */
export function deriveInitialStep(status: MfaStatus | null): MfaSetupStep {
  if (!status) return 'idle'
  return status.enabled ? 'enrolled' : 'idle'
}
