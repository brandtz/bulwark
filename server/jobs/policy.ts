/**
 * server/jobs/policy.ts — per-JobKind retry/backoff policy (L04-S1 / ADR-0005).
 *
 * # What this file does
 *   - One typed registry mapping every JobKind to its pg-boss retry policy.
 *     `Record<JobKind, JobPolicy>` makes adding a JobKind without a policy a
 *     TYPECHECK error (L04-S5), and `ALL_JOB_KINDS` derives from it so the
 *     queue list, the worker subscription list, and the policy can never
 *     drift apart.
 *
 * # Decisions (ADR-0005)
 *   - Default: 3 retries, exponential backoff from a 60s base. A transient
 *     Chromium OOM or a brief R2/DB blip resolves well inside 3 attempts;
 *     anything that fails 4 times straight needs an operator, not a retry.
 *   - `expireInSeconds` bounds a single attempt (pg-boss kills + retries a
 *     hung handler). Compliance renders get 15 min (Puppeteer on a cold
 *     Render instance is slow); the sweep jobs are pure SQL and get 10 min.
 *   - Policies apply at BOTH `createQueue` (queue default) and `send`
 *     (explicit per-message) — belt and braces, because pg-boss send options
 *     silently override queue defaults and a bare send would otherwise fall
 *     back to pg-boss's own defaults (retryLimit 2 as of v12).
 */
import type { JobKind } from '../../shared/contracts/job'

export interface JobPolicy {
  /** Attempts after the first failure. */
  retryLimit: number
  /** Base delay (seconds) between attempts. */
  retryDelay: number
  /** Exponential backoff on retryDelay. */
  retryBackoff: boolean
  /** Max seconds a single attempt may run before pg-boss expires it. */
  expireInSeconds: number
}

export const JOB_POLICIES: Record<JobKind, JobPolicy> = {
  compliance_doc: {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
  },
  account_purge: {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
  },
  coi_expiry_scan: {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
  },
  // WP-X3 / ED-00E: a scanner outage should not strand uploads as pending, so
  // retry longer (5 tries, 2-min exponential backoff).
  asset_scan: {
    retryLimit: 5,
    retryDelay: 120,
    retryBackoff: true,
    expireInSeconds: 5 * 60,
  },
}

/** Every JobKind, derived from the policy registry (single source of truth). */
export const ALL_JOB_KINDS = Object.keys(JOB_POLICIES) as JobKind[]
