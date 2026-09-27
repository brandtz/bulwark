/**
 * server/utils/env-guard.ts — production configuration guard for the web tier
 * (WP-L07 S4, ADR-0006).
 *
 * # Decisions
 *   - Pure evaluator over an env snapshot so every rule is unit-testable.
 *   - `critical` findings make the deployment unsafe to serve (forgeable
 *     sessions, stub renderers, mock data, local database, disabled rate
 *     limiting). `warnings` degrade features but are not unsafe.
 *   - Enforcement is opt-in per deployment: `BULWARK_ENV_GUARD=enforce` makes
 *     boot fail on any critical finding. Without it findings are logged at
 *     error level and /api/ready reports `configOk: false`, so turning the
 *     guard on can never take an existing production down unannounced. Set
 *     it once the report is clean.
 *   - Mirrors the worker rules in server/jobs/env-guard.ts.
 */
export type GuardEnv = Record<string, string | undefined>

export interface EnvGuardReport {
  critical: string[]
  warnings: string[]
}

const DEV_SECRET_PREFIX = 'dev-only'

function weakSecret(value: string | undefined): boolean {
  return !value || value.length < 32 || value.startsWith(DEV_SECRET_PREFIX)
}

export function evaluateProductionEnv(env: GuardEnv): EnvGuardReport {
  const critical: string[] = []
  const warnings: string[] = []
  if (env.NODE_ENV !== 'production') return { critical, warnings }

  if (env.BULWARK_BACKEND === 'mock') critical.push('BULWARK_BACKEND=mock serves mock data')
  if (env.BULWARK_PDF_STUB === '1') critical.push('BULWARK_PDF_STUB=1 renders placeholder PDFs')
  if (env.BULWARK_STORAGE_DRIVER === 'fs') critical.push('BULWARK_STORAGE_DRIVER=fs stores uploads on the local filesystem')
  if (env.BULWARK_RATE_LIMIT_DISABLED === '1') critical.push('BULWARK_RATE_LIMIT_DISABLED=1 turns off login throttling')
  if (weakSecret(env.NUXT_SESSION_PASSWORD)) {
    critical.push('NUXT_SESSION_PASSWORD is missing, shorter than 32 characters or a dev default (sessions would be forgeable)')
  }
  if (env.JWT_SECRET === undefined || env.JWT_SECRET === '') {
    warnings.push('JWT_SECRET is not set; reset/invite tokens fall back to the session password')
  } else if (weakSecret(env.JWT_SECRET)) {
    critical.push('JWT_SECRET is shorter than 32 characters or a dev default')
  }
  const db = env.DATABASE_URL ?? ''
  if (!db) critical.push('DATABASE_URL is not set')
  else if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/u.test(db)) critical.push('DATABASE_URL points at a local database')

  const appUrl = env.BULWARK_APP_URL ?? ''
  if (!appUrl.startsWith('https://')) warnings.push('BULWARK_APP_URL is not an https URL; invite and reset emails cannot include links')
  if (env.BULWARK_NOTIFICATIONS_DISABLED === '1') warnings.push('BULWARK_NOTIFICATIONS_DISABLED=1 — outbound email/SMS fail by design')
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    warnings.push('R2 credentials are incomplete; uploads will fail')
  }
  return { critical, warnings }
}

/**
 * process.env of the running server. Nitro inlines NODE_ENV at build time, so a
 * built server can run with it unset — derive it from the build mode instead.
 */
export function runtimeGuardEnv(): GuardEnv {
  return { ...process.env, NODE_ENV: process.env.NODE_ENV || (import.meta.dev ? 'development' : 'production') }
}

/** Throws when enforcement is on and the environment has critical findings. */
export function assertProductionEnv(env: GuardEnv, report = evaluateProductionEnv(env)): void {
  if (env.BULWARK_ENV_GUARD !== 'enforce' || report.critical.length === 0) return
  throw new Error(`Refusing to serve with unsafe production configuration: ${report.critical.join('; ')}`)
}
