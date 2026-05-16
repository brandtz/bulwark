/**
 * shared/utils/likeEscape.ts — escape user input for SQL `LIKE` /
 * `ILIKE` patterns (W5-3 / ADR-0037).
 *
 * # Why this exists
 *
 * Drizzle parameterises the *value* passed to `ilike()` and `like()`,
 * so there is no SQL-injection risk. But the wildcards (`%`, `_`) and
 * the escape character (`\`) inside that value are still interpreted
 * by Postgres when matching. A search box that wraps user input as
 * `%${q}%` lets an attacker:
 *
 *   - submit `%` to widen the match to every row (data-exfiltration
 *     when scoping is otherwise correct),
 *   - submit `%admin%` to enumerate admin emails / names,
 *   - submit `_` to do single-char fishing,
 *   - submit `\` to break our future use of `ESCAPE '\'` if we ever
 *     add one.
 *
 * Wrapping every user-supplied LIKE term through this helper closes
 * those holes before the term is concatenated with the leading /
 * trailing `%`.
 *
 * # Decisions (ADR-0008, ADR-0037)
 *   - **Escape with backslash.** Postgres' default ESCAPE char for
 *     LIKE / ILIKE is `\`. Drizzle's `ilike()` doesn't add an ESCAPE
 *     clause, but the default still applies — `\%` matches a literal
 *     percent.
 *   - **Three chars only**: `\` itself (must come first to avoid
 *     double-escaping), then `%`, then `_`. No `[`/`]` because
 *     Postgres LIKE doesn't support character classes (that's
 *     SIMILAR TO).
 *   - **Pure utility, no IO.** Lives under `shared/utils/` so both
 *     real services and any future client-side preview can share it.
 *
 * # Decisions cast down
 *   - Using regex.escape-style allow-list. Rejected — LIKE has a
 *     tiny finite alphabet of special chars; a three-line replace is
 *     clearer than building a regex.
 *   - Stripping wildcards instead of escaping them. Rejected —
 *     escaping preserves the user's literal input ("100% off" still
 *     finds "100% off"). Stripping would change the meaning of the
 *     query.
 */

export function escapeLike(input: string): string {
  // Order matters — escape `\` first so we don't double-escape the
  // backslash we add for `%` and `_`.
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/** Convenience: build a `%term%` substring-match pattern with escaping. */
export function escapeLikeContains(input: string): string {
  return `%${escapeLike(input)}%`
}
