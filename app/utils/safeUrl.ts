/**
 * app/utils/safeUrl.ts — URL scheme allow-list for `:href` / `:src`
 * bindings on user-supplied URLs (W5-3 / ADR-0037).
 *
 * # Why this exists
 *
 * Any time the app binds a URL that came from the DB into an
 * `<a :href>` or `<img :src>` / `<iframe :src>`, an attacker who can
 * write that column (admin user supplying a logoUrl, a homeowner
 * receiving a compliance PDF URL someone tampered with, an
 * attachment row injected by a misconfigured importer, …) could
 * smuggle in `javascript:` or `data:text/html` to execute script in
 * the victim's session. Browsers do not block these schemes by
 * default on anchor tags.
 *
 * # Decisions (ADR-0008, ADR-0037)
 *   - **Allow-list, not deny-list.** We accept `http:`, `https:`,
 *     `mailto:`, `tel:`, and same-origin relative paths (`/`-rooted
 *     or fragment / query-only). Everything else collapses to `null`
 *     — the consumer template either falls back to a placeholder or
 *     omits the binding via `v-if`.
 *   - **No DOMPurify / sanitize-html dep** (per W5-3 hard constraint).
 *     This file is ~40 lines of plain TS; carrying a 10 KB sanitizer
 *     for one allow-list check is not worth it.
 *   - **Whitespace + control-char stripping** before scheme check.
 *     Browsers tolerate leading whitespace and `\t` / `\n` inside
 *     the scheme (`java\tscript:alert(1)` parses as javascript:).
 *     We strip them up front before the check.
 *   - **Case-insensitive scheme match.** `JAVASCRIPT:`,
 *     `Java\u200bScript:` etc. all defeat naive case-sensitive
 *     filters; we lower-case the scheme portion only.
 *
 * # Decisions cast down
 *   - Returning the original string on disallowed schemes to let the
 *     caller render something. Rejected — callers must consciously
 *     choose a fallback (placeholder image, empty string, etc.); a
 *     silent passthrough defeats the point of the helper.
 *   - Validating the full URL with `URL` constructor. Rejected for
 *     two reasons: (a) relative paths require a base, which is
 *     fragile; (b) the constructor accepts `javascript:` happily —
 *     it's only the scheme we care about.
 *
 * # Usage
 *
 *   <a :href="safeUrl(doc.resultUrl) ?? '#'" rel="noopener noreferrer" />
 *   <img :src="safeUrl(photo.url) ?? '/icons/placeholder.svg'" />
 */

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Return the input URL if its scheme is in the allow-list, or it is
 * a relative path (`/`-rooted, `?`-prefixed, `#`-prefixed, or has no
 * scheme delimiter at all). Returns `null` otherwise.
 *
 * Empty / nullish input returns `null` so the template can fall back.
 */
export function safeUrl(input: string | null | undefined): string | null {
  if (input == null) return null
  // Strip ASCII whitespace + control chars (incl. tab, NL, CR, NUL).
  // Browsers ignore them inside URL schemes; an allow-list that
  // didn't would be trivially bypassable.
  const cleaned = String(input).replace(/[\u0000-\u001f\u007f-\u009f\s]/gu, '')
  if (cleaned.length === 0) return null

  // Relative URLs: no scheme delimiter, or it appears after the path
  // start. We treat anything without `:` before the first `/`, `?`,
  // or `#` as relative.
  const colonIdx = cleaned.indexOf(':')
  if (colonIdx === -1) return cleaned
  const slashIdx = cleaned.indexOf('/')
  const queryIdx = cleaned.indexOf('?')
  const hashIdx = cleaned.indexOf('#')
  const firstNonScheme = [slashIdx, queryIdx, hashIdx]
    .filter((i) => i !== -1)
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
  if (colonIdx > firstNonScheme) {
    // The `:` is after a path / query / hash char — treat as relative.
    return cleaned
  }

  const scheme = cleaned.slice(0, colonIdx + 1).toLowerCase()
  if (ALLOWED_SCHEMES.has(scheme)) {
    return cleaned
  }
  return null
}
