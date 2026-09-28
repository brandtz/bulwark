/**
 * server/services/storage/backfill.ts — re-home legacy inline assets onto the
 * storage service (WP-L02-S5, epic L02 key decisions).
 *
 * Scans the four L02 asset columns for the placeholder schemes the L01-S3 guard
 * rejects (`data:` / `local://` / `blob:`, same predicate as the L01-S4 health
 * report) and, with `apply`, rewrites each one:
 *   - `data:` with a MIME + size the entity policy allows → bytes written to a
 *     fresh key (`putObject`), column rewritten to the key.
 *   - anything else (a `local://`/`blob:` stub, or a data: URL the policy
 *     rejects) has no recoverable bytes → nullable columns are cleared; rows
 *     whose column is NOT NULL (photo/attachment url) are soft-deleted, since
 *     they cannot render anyway.
 * Dry-run (default) only counts. Idempotent: a second apply finds 0 rows.
 *
 * COI docs + deliverables are reported by the health census but owned by L11;
 * their read paths do not sign keys yet, so they are deliberately not migrated.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { memberships, orgBranding, propertyAttachments, propertyPhotos, users } from '../../db/schema'
import { validateUpload, type StorageEntityKind } from '../../../shared/contracts/storage'
import { getStorage } from './index'
import { buildStorageKey } from './keys'
import { placeholderPredicate } from './legacy-report'

export interface BackfillColumnReport {
  table: string
  column: string
  /** Placeholder rows found. */
  found: number
  /** Rewritten to a storage key (or would be, on dry-run). */
  migrated: number
  /** Unrecoverable: column cleared or row soft-deleted (or would be). */
  dropped: number
}

export interface BackfillOptions {
  apply: boolean
  /** Restrict to one organization (default: all). */
  organizationId?: string
  log?: (line: string) => void
}

interface Decoded { contentType: string, body: Buffer }

/** Decode a data: URL into bytes, or null when it is not one. */
export function decodeDataUrl(value: string): Decoded | null {
  const m = /^\s*data:([^;,]*)((?:;[^;,]*)*),(.*)$/isu.exec(value)
  if (!m) return null
  const contentType = (m[1] || 'text/plain').trim().toLowerCase()
  const isBase64 = /;base64$/iu.test(m[2] ?? '')
  const payload = m[3] ?? ''
  try {
    const body = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8')
    return { contentType, body }
  } catch {
    return null
  }
}

interface Target {
  tenantId: string
  entity: StorageEntityKind
  entityId: string
  value: string
  /** Persist the new key (or null) for this row. */
  write: (next: string | null) => Promise<void>
  /** For NOT NULL columns: retire the row instead of nulling. */
  retire?: () => Promise<void>
}

async function processTargets(
  report: BackfillColumnReport,
  targets: Target[],
  opts: BackfillOptions,
): Promise<void> {
  report.found = targets.length
  for (const t of targets) {
    const decoded = decodeDataUrl(t.value)
    if (decoded && validateUpload(t.entity, decoded.contentType, decoded.body.length).ok) {
      report.migrated++
      if (!opts.apply) continue
      const key = buildStorageKey({ tenantId: t.tenantId, entity: t.entity, entityId: t.entityId, contentType: decoded.contentType })
      await getStorage().putObject({ key, body: decoded.body, contentType: decoded.contentType })
      await t.write(key)
    } else {
      report.dropped++
      if (!opts.apply) continue
      if (t.retire) await t.retire()
      else await t.write(null)
    }
  }
  opts.log?.(`${report.table}.${report.column}: found ${report.found}, migrate ${report.migrated}, drop ${report.dropped}${opts.apply ? '' : ' (dry-run)'}`)
}

export async function runAssetBackfill(opts: BackfillOptions): Promise<BackfillColumnReport[]> {
  const db = getDb()
  const org = opts.organizationId
  const now = new Date()
  const reports: BackfillColumnReport[] = []
  const report = (table: string, column: string): BackfillColumnReport => {
    const r = { table, column, found: 0, migrated: 0, dropped: 0 }
    reports.push(r)
    return r
  }

  // property_photos.url (NOT NULL → retire unrecoverable rows)
  const photos = await db.select().from(propertyPhotos).where(and(
    isNull(propertyPhotos.deletedAt),
    placeholderPredicate(propertyPhotos.url),
    org ? eq(propertyPhotos.organizationId, org) : undefined,
  ))
  await processTargets(report('property_photos', 'url'), photos.map((p) => ({
    tenantId: p.organizationId,
    entity: 'property_photo' as const,
    entityId: p.propertyId,
    value: p.url,
    write: async (next) => { await db.update(propertyPhotos).set({ url: next!, updatedAt: now }).where(eq(propertyPhotos.id, p.id)) },
    retire: async () => { await db.update(propertyPhotos).set({ deletedAt: now, updatedAt: now }).where(eq(propertyPhotos.id, p.id)) },
  })), opts)

  // property_photos.thumbnail_url (nullable). Re-read: the pass above may have retired rows.
  const thumbs = await db.select().from(propertyPhotos).where(and(
    isNull(propertyPhotos.deletedAt),
    sql`${propertyPhotos.thumbnailUrl} is not null`,
    placeholderPredicate(propertyPhotos.thumbnailUrl),
    org ? eq(propertyPhotos.organizationId, org) : undefined,
  ))
  await processTargets(report('property_photos', 'thumbnail_url'), thumbs.map((p) => ({
    tenantId: p.organizationId,
    entity: 'property_photo' as const,
    entityId: p.propertyId,
    value: p.thumbnailUrl!,
    write: async (next) => { await db.update(propertyPhotos).set({ thumbnailUrl: next, updatedAt: now }).where(eq(propertyPhotos.id, p.id)) },
  })), opts)

  // property_attachments.url (NOT NULL)
  const attachments = await db.select().from(propertyAttachments).where(and(
    isNull(propertyAttachments.deletedAt),
    placeholderPredicate(propertyAttachments.url),
    org ? eq(propertyAttachments.organizationId, org) : undefined,
  ))
  await processTargets(report('property_attachments', 'url'), attachments.map((a) => ({
    tenantId: a.organizationId,
    entity: 'property_attachment' as const,
    entityId: a.propertyId,
    value: a.url,
    write: async (next) => { await db.update(propertyAttachments).set({ url: next!, updatedAt: now }).where(eq(propertyAttachments.id, a.id)) },
    retire: async () => { await db.update(propertyAttachments).set({ deletedAt: now, updatedAt: now }).where(eq(propertyAttachments.id, a.id)) },
  })), opts)

  // org_branding.logo_url (nullable)
  const logos = await db.select().from(orgBranding).where(and(
    isNull(orgBranding.deletedAt),
    sql`${orgBranding.logoUrl} is not null`,
    placeholderPredicate(orgBranding.logoUrl),
    org ? eq(orgBranding.organizationId, org) : undefined,
  ))
  await processTargets(report('org_branding', 'logo_url'), logos.map((b) => ({
    tenantId: b.organizationId,
    entity: 'branding_logo' as const,
    entityId: b.organizationId,
    value: b.logoUrl!,
    write: async (next) => { await db.update(orgBranding).set({ logoUrl: next, updatedAt: now }).where(eq(orgBranding.id, b.id)) },
  })), opts)

  // users.avatar_url (nullable, user-global). Keys are tenant-prefixed, so the
  // object goes under the user's oldest active membership (or `org` if given).
  const avatarRows = await db
    .select({ id: users.id, avatarUrl: users.avatarUrl, organizationId: memberships.organizationId })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.isActive, true)))
    .where(and(
      sql`${users.avatarUrl} is not null`,
      placeholderPredicate(users.avatarUrl),
      org ? eq(memberships.organizationId, org) : undefined,
    ))
    .orderBy(users.id, memberships.createdAt)
  const seen = new Set<string>()
  const avatars = avatarRows.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  await processTargets(report('users', 'avatar_url'), avatars.map((u) => ({
    tenantId: u.organizationId,
    entity: 'avatar' as const,
    entityId: u.id,
    value: u.avatarUrl!,
    write: async (next) => { await db.update(users).set({ avatarUrl: next, updatedAt: now }).where(eq(users.id, u.id)) },
  })), opts)

  return reports
}
