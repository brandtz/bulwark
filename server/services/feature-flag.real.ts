/**
 * server/services/feature-flag.real.ts — RealFeatureFlagService
 * (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008, ADR-0021)
 *   - Per-org override merge happens here, not in SQL: `listForOrg`
 *     loads all rows for `org IS NULL` and `org = :orgId`, then folds
 *     them by slug with override-wins. KNOWN_FLAGS seeds anything not
 *     yet persisted so a fresh DB renders actionable rows.
 *   - `set()` writes ONE row — either the global default (orgId null,
 *     super_admin only at the page) or the org override. Audit row
 *     captures before/after for the slug.
 *   - `set()` uses an upsert keyed on `(coalesce(org_id, '0…'), slug)`
 *     matching the partial unique index on the table.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import type {
  FeatureFlag,
  FeatureFlagMerged,
  FeatureFlagSetInput,
  IFeatureFlagService,
} from '../../shared/contracts/feature-flag'
import { KNOWN_FLAGS } from '../../shared/contracts/feature-flag'
import { featureFlags } from '../db/schema/feature_flags'
import type { FeatureFlagRow } from '../db/schema/feature_flags'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: FeatureFlagRow): FeatureFlag {
  return {
    id: r.id,
    organizationId: r.organizationId,
    slug: r.slug,
    value: r.value,
    description: r.description,
    updatedByUserId: r.updatedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealFeatureFlagService implements IFeatureFlagService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(): Promise<{ rows: FeatureFlag[] }> {
    const db = getDb()
    const rows = await db.select().from(featureFlags)
    return { rows: rows.map(rowToContract) }
  }

  async get(organizationId: string | null, slug: string): Promise<FeatureFlag | null> {
    if (organizationId) assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const whereOrg = organizationId
      ? eq(featureFlags.organizationId, organizationId)
      : isNull(featureFlags.organizationId)
    const [row] = await db
      .select()
      .from(featureFlags)
      .where(and(whereOrg, eq(featureFlags.slug, slug)))
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async set(input: FeatureFlagSetInput): Promise<FeatureFlag> {
    if (input.organizationId) assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const whereOrg = input.organizationId
        ? eq(featureFlags.organizationId, input.organizationId)
        : isNull(featureFlags.organizationId)
      const [existing] = await tx
        .select()
        .from(featureFlags)
        .where(and(whereOrg, eq(featureFlags.slug, input.slug)))
        .limit(1)

      let row: FeatureFlagRow
      if (existing) {
        const [updated] = await tx
          .update(featureFlags)
          .set({
            value: input.value,
            description: input.description ?? existing.description,
            updatedByUserId: input.updatedByUserId,
            updatedAt: new Date(),
          })
          .where(eq(featureFlags.id, existing.id))
          .returning()
        row = updated!
      } else {
        const [inserted] = await tx
          .insert(featureFlags)
          .values({
            organizationId: input.organizationId,
            slug: input.slug,
            value: input.value,
            description: input.description ?? null,
            updatedByUserId: input.updatedByUserId,
          })
          .returning()
        row = inserted!
      }

      await audit.record({
        organizationId: input.organizationId ?? '00000000-0000-0000-0000-000000000000',
        entityType: 'feature_flag',
        entityId: row.id,
        action: existing ? 'update' : 'create',
        actorUserId: input.updatedByUserId,
        before: existing ? { value: existing.value } : null,
        after: { value: input.value },
      })
      return rowToContract(row)
    })
  }

  async listForOrg(organizationId: string): Promise<{ rows: FeatureFlagMerged[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(featureFlags)
      .where(
        sql`${featureFlags.organizationId} IS NULL OR ${featureFlags.organizationId} = ${organizationId}`,
      )

    const defaults = new Map<string, FeatureFlagRow>()
    const overrides = new Map<string, FeatureFlagRow>()
    for (const r of rows) {
      if (r.organizationId === null) defaults.set(r.slug, r)
      else overrides.set(r.slug, r)
    }

    const slugs = new Set<string>([
      ...defaults.keys(),
      ...overrides.keys(),
      ...KNOWN_FLAGS.map((k) => k.slug),
    ])

    const merged: FeatureFlagMerged[] = []
    for (const slug of slugs) {
      const def = defaults.get(slug)
      const ovr = overrides.get(slug)
      const known = KNOWN_FLAGS.find((k) => k.slug === slug)
      const defaultValue = def?.value ?? known?.defaultValue ?? null
      const description = ovr?.description ?? def?.description ?? known?.description ?? null
      merged.push({
        slug,
        value: ovr?.value ?? defaultValue ?? '',
        description,
        hasOverride: !!ovr,
        defaultValue,
      })
    }
    merged.sort((a, b) => a.slug.localeCompare(b.slug))
    return { rows: merged }
  }
}
