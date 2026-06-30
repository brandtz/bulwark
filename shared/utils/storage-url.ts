/**
 * shared/utils/storage-url.ts — production placeholder-URL guard (L01-S3 / ADR-0001).
 *
 * Assets (photos, attachments, avatars, logos) must reference a real object-storage
 * key or an http(s) URL in production — never an inline `data:` blob or a `local://`
 * dev stub. This guard throws at the persist boundary so a placeholder can never be
 * written to the production database.
 *
 * In dev/test it is a deliberate no-op so existing flows keep working until L02
 * migrates each path onto the storage service. The guard is the safety net that makes
 * a premature production deploy fail loudly instead of silently persisting base64.
 */
const PLACEHOLDER_SCHEMES = ['data:', 'local://', 'blob:']

export function assertStorableUrlOrKey(value: string | null | undefined): void {
  if (!value) return
  if (process.env.NODE_ENV !== 'production') return
  // Normalize before matching: the `data:` scheme is case-insensitive (RFC 2397)
  // and leading whitespace would slip a placeholder past a naive startsWith.
  const normalized = value.trimStart().toLowerCase()
  if (PLACEHOLDER_SCHEMES.some((scheme) => normalized.startsWith(scheme))) {
    // Message starts with "Invalid" so the RPC dispatcher maps it to a 400, not a 500.
    throw new Error(
      'Invalid asset URL: refusing to persist a placeholder (data: / local:// / blob:) in ' +
        'production; upload via the object-storage service and store the returned key.',
    )
  }
}
