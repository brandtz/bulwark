/**
 * server/services/storage/legacy-report.ts — legacy placeholder-asset census (L01-S4).
 *
 * # What this file does
 *   - Counts live rows whose asset column still holds a placeholder value
 *     (`data:` / `local://` / `blob:`) instead of a storage key or http(s) URL.
 *     This is the read-only evidence base L02 uses to size + verify the
 *     migration of each asset path onto the object-storage service.
 *
 * # Decisions (ADR-0001, L01-S4)
 *   - **Org-scoped, not global.** The health endpoint runs as an org admin;
 *     counts are for the active organization only. A super_admin sees the same
 *     org-scoped view for whatever org is active — global sweeps belong to the
 *     L02 backfill script, not a request-path endpoint.
 *   - **Predicate matches the L01-S3 guard exactly** (lower + ltrim before the
 *     scheme match) so the report and the write-guard can never disagree about
 *     what counts as a placeholder (the RFC 2397 case/whitespace lesson).
 *   - **`intentionalInline` flags avatars.** `users.avatar_url` is *meant* to be
 *     an inline data URL (≤48KB) until L02-S3 migrates avatars; the column is
 *     counted for visibility but flagged so nobody treats it as a defect today.
 *   - **Soft-delete aware.** Tables with `deleted_at` count live rows only —
 *     migrating tombstones is L02's call, and inflating the census with dead
 *     rows would misdirect it.
 *   - Raw `sql` fragments (not a query builder loop) because each table needs
 *     its own column list; the fragment is parameter-free and injection-safe
 *     (all identifiers are compile-time constants from the schema barrel).
 */
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { getDb } from '../../db/client'
import {
  deliverables,
  orgBranding,
  memberships,
  propertyAttachments,
  propertyPhotos,
  subcontractorCoiDocs,
  users,
} from '../../db/schema'

export interface LegacyAssetCount {
  /** Physical table name (as in Postgres). */
  table: string
  /** Physical column name. */
  column: string
  /** Live rows whose value is a data:/local:///blob: placeholder. */
  count: number
  /**
   * True when the inline representation is intentional today (avatars stay
   * inline data URLs until L02-S3) — informational, not a defect.
   */
  intentionalInline: boolean
}

/** The exact scheme set the L01-S3 write-guard rejects. Keep in lockstep. */
const PLACEHOLDER_SCHEMES = ['data:', 'local://', 'blob:'] as const

/** SQL predicate mirroring `assertStorableUrlOrKey`'s normalization. */
function placeholderPredicate(col: PgColumn): SQL {
  const normalized = sql`lower(ltrim(${col}))`
  return sql`(${normalized} like ${PLACEHOLDER_SCHEMES[0] + '%'} or ${normalized} like ${
    PLACEHOLDER_SCHEMES[1] + '%'
  } or ${normalized} like ${PLACEHOLDER_SCHEMES[2] + '%'})`
}

/**
 * Count legacy placeholder rows per asset column for one organization.
 * Read-only; safe to call from a request path (six indexed-org COUNT scans).
 */
export async function countLegacyAssetRows(organizationId: string): Promise<LegacyAssetCount[]> {
  const db = getDb()

  const orgScoped: Array<{
    table: string
    column: string
    where: SQL
    intentionalInline?: boolean
  }> = [
    {
      table: 'property_photos',
      column: 'url',
      where: sql`${propertyPhotos.organizationId} = ${organizationId} and ${propertyPhotos.deletedAt} is null and ${placeholderPredicate(propertyPhotos.url)}`,
    },
    {
      table: 'property_photos',
      column: 'thumbnail_url',
      where: sql`${propertyPhotos.organizationId} = ${organizationId} and ${propertyPhotos.deletedAt} is null and ${propertyPhotos.thumbnailUrl} is not null and ${placeholderPredicate(propertyPhotos.thumbnailUrl)}`,
    },
    {
      table: 'property_attachments',
      column: 'url',
      where: sql`${propertyAttachments.organizationId} = ${organizationId} and ${propertyAttachments.deletedAt} is null and ${placeholderPredicate(propertyAttachments.url)}`,
    },
    {
      table: 'org_branding',
      column: 'logo_url',
      where: sql`${orgBranding.organizationId} = ${organizationId} and ${orgBranding.deletedAt} is null and ${orgBranding.logoUrl} is not null and ${placeholderPredicate(orgBranding.logoUrl)}`,
    },
    {
      table: 'subcontractor_coi_docs',
      column: 'file_url',
      where: sql`${subcontractorCoiDocs.organizationId} = ${organizationId} and ${subcontractorCoiDocs.deletedAt} is null and ${placeholderPredicate(subcontractorCoiDocs.fileUrl)}`,
    },
    {
      table: 'deliverables',
      column: 'result_url',
      where: sql`${deliverables.organizationId} = ${organizationId} and ${deliverables.deletedAt} is null and ${deliverables.resultUrl} is not null and ${placeholderPredicate(deliverables.resultUrl)}`,
    },
  ]

  const tableByName = {
    property_photos: propertyPhotos,
    property_attachments: propertyAttachments,
    org_branding: orgBranding,
    subcontractor_coi_docs: subcontractorCoiDocs,
    deliverables,
  } as const

  const results: LegacyAssetCount[] = []
  for (const spec of orgScoped) {
    const table = tableByName[spec.table as keyof typeof tableByName]
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(spec.where)
    results.push({
      table: spec.table,
      column: spec.column,
      count: row?.n ?? 0,
      intentionalInline: spec.intentionalInline ?? false,
    })
  }

  // users.avatar_url — global table, scoped via the org's memberships. Counted
  // for L02-S3 sizing but flagged intentional (excluded from the L01-S3 guard).
  const [avatarRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(memberships, sql`${memberships.userId} = ${users.id}`)
    .where(
      sql`${memberships.organizationId} = ${organizationId} and ${users.avatarUrl} is not null and ${placeholderPredicate(users.avatarUrl)}`,
    )
  results.push({
    table: 'users',
    column: 'avatar_url',
    count: avatarRow?.n ?? 0,
    intentionalInline: true,
  })

  return results
}
