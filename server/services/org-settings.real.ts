/**
 * server/services/org-settings.real.ts — RealOrgSettingsService
 * (Wave 1B / EH-H / W1-3).
 *
 * Singleton-per-org. `get()` upserts a defaults row on miss inside an
 * audited transaction. `update()` is a tx-bound update + audit.
 */
import { and, eq, sql } from 'drizzle-orm'
import {
  type IOrgSettingsService,
  type OrganizationProfile,
  type OrganizationProfileUpdateInput,
  type OrgSettings,
  type OrgSettingsUpdateInput,
  ORG_SETTINGS_DEFAULTS,
  OrganizationProfileUpdateInputSchema,
} from '../../shared/contracts/org-settings'
import { getDb } from '../db/client'
import { orgSettings } from '../db/schema/org_settings'
import { organizations } from '../db/schema/organizations'
import { assertSameTenant, resolveActorUserId, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: typeof orgSettings.$inferSelect): OrgSettings {
  return {
    id: r.id,
    organizationId: r.organizationId,
    quoteNumberFormat: r.quoteNumberFormat,
    woNumberFormat: r.woNumberFormat,
    invoiceNumberFormat: r.invoiceNumberFormat,
    defaultMarkupBps: r.defaultMarkupBps,
    defaultTaxBps: r.defaultTaxBps,
    defaultQuoteExpiryDays: r.defaultQuoteExpiryDays,
    defaultInvoiceTermsDays: r.defaultInvoiceTermsDays,
    defaultSlaDaysAssessment: r.defaultSlaDaysAssessment,
    defaultSlaDaysQuote: r.defaultSlaDaysQuote,
    uiHistoryDays: r.uiHistoryDays,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealOrgSettingsService implements IOrgSettingsService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async get(organizationId: string): Promise<OrgSettings> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [existing] = await db
      .select()
      .from(orgSettings)
      .where(
        and(
          eq(orgSettings.organizationId, organizationId),
          sql`${orgSettings.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    if (existing) return rowToContract(existing)
    return await withAudit(async ({ tx, audit }) => {
      // Race-safe: another concurrent request may have inserted between
      // the select above and this insert. ON CONFLICT DO NOTHING + re-read
      // collapses both branches to the same row.
      await tx
        .insert(orgSettings)
        .values({ organizationId, ...ORG_SETTINGS_DEFAULTS })
        .onConflictDoNothing({ target: orgSettings.organizationId })
      const [row] = await tx
        .select()
        .from(orgSettings)
        .where(eq(orgSettings.organizationId, organizationId))
        .limit(1)
      await audit.record({
        organizationId,
        entityType: 'org_settings',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        metadata: { kind: 'org_settings_bootstrap' },
        after: { defaults: true },
      })
      return rowToContract(row!)
    })
  }

  async update(input: OrgSettingsUpdateInput): Promise<OrgSettings> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    // Ensure a row exists (idempotent).
    const before = await this.get(input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const patch: Partial<typeof orgSettings.$inferInsert> = { updatedAt: new Date() }
      if (input.quoteNumberFormat !== undefined) patch.quoteNumberFormat = input.quoteNumberFormat
      if (input.woNumberFormat !== undefined) patch.woNumberFormat = input.woNumberFormat
      if (input.invoiceNumberFormat !== undefined) patch.invoiceNumberFormat = input.invoiceNumberFormat
      if (input.defaultMarkupBps !== undefined) patch.defaultMarkupBps = input.defaultMarkupBps
      if (input.defaultTaxBps !== undefined) patch.defaultTaxBps = input.defaultTaxBps
      if (input.defaultQuoteExpiryDays !== undefined) patch.defaultQuoteExpiryDays = input.defaultQuoteExpiryDays
      if (input.defaultInvoiceTermsDays !== undefined) patch.defaultInvoiceTermsDays = input.defaultInvoiceTermsDays
      if (input.defaultSlaDaysAssessment !== undefined) patch.defaultSlaDaysAssessment = input.defaultSlaDaysAssessment
      if (input.defaultSlaDaysQuote !== undefined) patch.defaultSlaDaysQuote = input.defaultSlaDaysQuote
      if (input.uiHistoryDays !== undefined) {
        if (input.uiHistoryDays < 30 || input.uiHistoryDays > 365) throw new Error('Invalid uiHistoryDays: must be 30-365')
        patch.uiHistoryDays = input.uiHistoryDays
      }
      const [after] = await tx
        .update(orgSettings)
        .set(patch)
        .where(eq(orgSettings.organizationId, input.organizationId))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'org_settings',
        entityId: after!.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: {
          quoteNumberFormat: before.quoteNumberFormat,
          woNumberFormat: before.woNumberFormat,
          invoiceNumberFormat: before.invoiceNumberFormat,
          defaultMarkupBps: before.defaultMarkupBps,
        },
        after: {
          quoteNumberFormat: after!.quoteNumberFormat,
          woNumberFormat: after!.woNumberFormat,
          invoiceNumberFormat: after!.invoiceNumberFormat,
          defaultMarkupBps: after!.defaultMarkupBps,
        },
      })
      return rowToContract(after!)
    })
  }

  async getOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1)
    if (!org) throw new Error(`Organization not found: ${organizationId}`)
    return { id: org.id, name: org.name, slug: org.slug, brandColor: org.brandColor }
  }

  async updateOrganizationProfile(
    input: OrganizationProfileUpdateInput,
  ): Promise<OrganizationProfile> {
    // L12-S1: the tenant identity row. Zod-parse at the boundary (name
    // length, hex color); slug is immutable — it lives in URLs and e-mail
    // links, renaming it would orphan them.
    const parsed = OrganizationProfileUpdateInputSchema.parse(input)
    assertSameTenant(this.tenantResolver, parsed.organizationId)
    const before = await this.getOrganizationProfile(parsed.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const patch: Partial<typeof organizations.$inferInsert> = { updatedAt: new Date() }
      if (parsed.name !== undefined) patch.name = parsed.name
      if (parsed.brandColor !== undefined) patch.brandColor = parsed.brandColor
      const [after] = await tx
        .update(organizations)
        .set(patch)
        .where(eq(organizations.id, parsed.organizationId))
        .returning()
      await audit.record({
        organizationId: parsed.organizationId,
        entityType: 'organization',
        entityId: parsed.organizationId,
        action: 'update',
        actorUserId: resolveActorUserId(this.tenantResolver),
        before: { name: before.name, brandColor: before.brandColor },
        after: { name: after!.name, brandColor: after!.brandColor },
      })
      return {
        id: after!.id,
        name: after!.name,
        slug: after!.slug,
        brandColor: after!.brandColor,
      }
    })
  }
}
