/**
 * shared/utils/numbering.ts — sequential number formatter
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * # Why this exists
 *
 * Quote / WO / Invoice services need to emit numbers in tenant-
 * configurable formats (per `IOrgSettingsService` → numberFormat
 * fields). This pure helper resolves the format string against
 * `(year, seq)` so the services don't each re-implement template
 * tokenisation.
 *
 * # Tokens
 *
 *   `{year}`       — 4-digit UTC year
 *   `{seq}`        — sequence number, no padding
 *   `{seq:N}`      — sequence number, zero-padded to width N (e.g. `{seq:04}` → `0042`)
 *
 * Unknown tokens are left in place (defensive — admins typing a
 * custom format like `INVOICE-{year}-{seq:04}-FY26` shouldn't lose
 * the literal `FY26` suffix).
 */

export interface FormatSequentialNumberInput {
  format: string
  year: number
  seq: number
}

export function formatSequentialNumber({ format, year, seq }: FormatSequentialNumberInput): string {
  let out = format.replace(/\{year\}/g, String(year))
  out = out.replace(/\{seq:(\d+)\}/g, (_, w) => String(seq).padStart(Number(w), '0'))
  out = out.replace(/\{seq\}/g, String(seq))
  return out
}

/**
 * Build a SQL `LIKE` pattern matching every number this format will
 * ever emit for a given year. Used by the real services' "find max
 * sequence" query when the format is admin-customised.
 *
 * Approach: replace `{year}` literally, replace every `{seq}` /
 * `{seq:N}` with `%`. The result is the LIKE pattern that matches
 * any sequence for that year under that format. Two consecutive `%`
 * collapse harmlessly in SQL.
 */
export function buildLikePatternForYear(format: string, year: number): string {
  let out = format.replace(/\{year\}/g, String(year))
  out = out.replace(/\{seq(:\d+)?\}/g, '%')
  return out
}
