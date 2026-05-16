/**
 * server/utils/logger.ts — tiny structured JSON logger
 * (W3-5 / EH-Q / ADR-0034).
 *
 * # Decisions (ADR-0008, ADR-0034)
 *   - **No dependency**. Per the W3-5 constraint, we ship a tiny JSON
 *     wrapper instead of pino/winston. One `log(level, message,
 *     fields)` entry point emits `{ ts, level, message, ...fields }`
 *     to stdout (errors go to stderr). The Phase-2 ADR documents the
 *     promotion to pino or OpenTelemetry.
 *   - **Level filter via env**. `BULWARK_LOG_LEVEL` (debug|info|warn|
 *     error, default `info`) gates the emit. Lower-priority lines are
 *     dropped before serialization so hot paths pay nothing for
 *     debug logging in production.
 *   - **Sensitive-field stripping**. The redact helper walks the
 *     fields object recursively (W5-2 / ADR-0036) and replaces any
 *     key matching the deny list (auth credentials + PII patterns
 *     like ssn / dob / creditCard / ein) or any field whose name
 *     ends in `_encrypted` with the string `[REDACTED]`. Cycles
 *     are short-circuited so circular refs don't blow the stack.
 *     Used by both `log()` and the request-context middleware.
 *   - **Side-effect free at import time**. Reading `process.env`
 *     happens inside `currentLevel()` so test files can mutate the
 *     env between calls without re-importing.
 *
 * # Decision cast down
 *   - Rejected: child loggers / a `Logger` class. The signature
 *     `log(level, message, fields)` is enough for Phase 1; adding
 *     bind/child surfaces would be premature.
 *   - Rejected: writing to a file. Stdout-only matches the
 *     "12-factor" pattern Render and Netlify expect; aggregators
 *     attach themselves to the stream.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const REDACT_KEYS = new Set([
  // Auth / credentials
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'authtoken',
  'auth_token',
  // PII / regulated data (W5-2 / ADR-0036)
  'ssn',
  'dob',
  'dateofbirth',
  'date_of_birth',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'bankaccount',
  'bank_account',
  'routingnumber',
  'routing_number',
  'taxid',
  'tax_id',
  'ein',
  'driverlicense',
  'driver_license',
  'driverslicense',
  'drivers_license',
])

/**
 * Defense-in-depth: any field name with the suffix `_encrypted` (the
 * convention we use for at-rest sealed columns — see `user_mfa.
 * secret_encrypted`, `provider_configs.config_encrypted`) is redacted
 * unconditionally. Encrypted-at-rest values should never appear in
 * logs, even though they're already opaque ciphertext.
 */
function isRedactedKey(name: string): boolean {
  const lower = name.toLowerCase()
  if (REDACT_KEYS.has(lower)) return true
  if (lower.endsWith('_encrypted')) return true
  if (lower.endsWith('encrypted')) return true
  return false
}

function currentLevel(): LogLevel {
  const raw = (process.env.BULWARK_LOG_LEVEL ?? 'info').toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return 'info'
}

/**
 * Walk fields and replace any sensitive value with `[REDACTED]`. The
 * walk is recursive — nested objects and arrays are traversed so a
 * credential tucked into `{ provider: { config: { apiKey: ... } } }`
 * never makes it to stdout (W5-2 / ADR-0036). Cycles are short-
 * circuited via a visited WeakSet so circular references don't
 * blow the stack.
 */
export function redactFields(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!fields) return {}
  const seen = new WeakSet<object>()
  return walk(fields, seen) as Record<string, unknown>
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, seen))
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isRedactedKey(k)) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = walk(v, seen)
    }
  }
  return out
}

export interface LogEvent {
  ts: string
  level: LogLevel
  message: string
  [k: string]: unknown
}

/**
 * Build the event object without writing. Exposed so tests can
 * assert shape without mocking stdout. Returns `null` if the
 * level is filtered out.
 */
export function buildLogEvent(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
): LogEvent | null {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel()]) return null
  return {
    ts: new Date().toISOString(),
    level,
    message,
    ...redactFields(fields),
  }
}

/**
 * Emit one JSON line per call. Errors go to stderr; everything else
 * to stdout.
 */
export function log(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
): void {
  const evt = buildLogEvent(level, message, fields)
  if (!evt) return
  const line = JSON.stringify(evt)
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line)
  } else {
    // eslint-disable-next-line no-console
    console.log(line)
  }
}
