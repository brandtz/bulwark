/**
 * server/services/label.real.ts — RealLabelService (EH-B / W1-2 / ADR-0014).
 *
 * What this file does:
 *   - Postgres-backed implementation of `ILabelService`. Two tables:
 *       1. `labels` — override rows, composite unique on
 *          `(organizationId, namespace, key, locale)`.
 *       2. `org_branding` — singleton per org.
 *   - Mirrors the mock contract row-for-row.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - **Soft delete on labels** (per CONVENTIONS) — `delete(id)` writes
 *     `deletedAt`. `getMap()` filters by `deletedAt IS NULL`. Audit row
 *     is recorded with `action='delete'`.
 *   - **Upsert via INSERT ... ON CONFLICT** keyed on
 *     `(organizationId, namespace, key, locale)`. Same idempotency story
 *     as `compliance_standards`.
 *   - **Branding is a singleton** — INSERT ... ON CONFLICT (organizationId)
 *     DO UPDATE. No soft-delete column; a tenant "deletes" by clearing
 *     fields back to defaults.
 *   - **Tenant firewall** mirrors the mock: every method calls
 *     `assertSameTenant` BEFORE any DB access.
 *
 * Decisions NOT taken:
 *   - We considered emitting a domain event on each upsert. Rejected for
 *     now — W1-4 wires the bus; this service joins the bus when it lands
 *     (one of the follow-on hooks in the handoff).
 *   - We considered separating the `bulkUpsert` into a single multi-row
 *     INSERT ... ON CONFLICT. Rejected for v1 — bulk edits in the editor
 *     are ≤ ~80 rows and we want one audit row per change. A loop keeps
 *     the audit story unambiguous.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type {
  Branding,
  BrandingUpdateInput,
  ILabelService,
  Label,
  LabelBulkUpsertInput,
  LabelListInput,
  LabelListOutput,
  LabelMapOutput,
  LabelNamespace,
  LabelUpsertInput,
} from '../../shared/contracts/label'
import { DEFAULT_LOCALE } from '../../shared/contracts/label'
import { getDb } from '../db/client'
import { labels } from '../db/schema/labels'
import { orgBranding } from '../db/schema/org_branding'
import type { LabelRow as DbLabelRow } from '../db/schema/labels'
import type { OrgBrandingRow as DbBrandingRow } from '../db/schema/org_branding'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbLabelRow): Label {
  return {
    id: r.id,
    organizationId: r.organizationId,
    namespace: r.namespace as LabelNamespace,
    key: r.key,
    locale: r.locale,
    value: r.value,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function brandingRowToContract(r: DbBrandingRow): Branding {
  return {
    id: r.id,
    organizationId: r.organizationId,
    logoUrl: r.logoUrl,
    primaryColor: r.primaryColor,
    accentColor: r.accentColor,
    footerText: r.footerText,
    supportEmail: r.supportEmail,
    supportPhone: r.supportPhone,
    licenseLabel: r.licenseLabel,
    timezone: r.timezone,
    currencyCode: r.currencyCode,
    dateFormat: r.dateFormat,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function syntheticBranding(orgId: string): Branding {
  const now = new Date().toISOString()
  return {
    id: '00000000-0000-0000-0000-000000000000',
    organizationId: orgId,
    logoUrl: null,
    primaryColor: '#1E3A8A',
    accentColor: '#FF6B35',
    footerText: null,
    supportEmail: null,
    supportPhone: null,
    licenseLabel: null,
    timezone: 'America/Los_Angeles',
    currencyCode: 'USD',
    dateFormat: 'MM/dd/yyyy',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export class RealLabelService implements ILabelService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: LabelListInput): Promise<LabelListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const locale = input.locale ?? DEFAULT_LOCALE
    const conditions: SQL[] = [
      eq(labels.organizationId, input.organizationId),
      eq(labels.locale, locale),
      sql`${labels.deletedAt} IS NULL`,
    ]
    if (input.namespace) conditions.push(eq(labels.namespace, input.namespace))
    const rows = await db
      .select()
      .from(labels)
      .where(and(...conditions))
    return { rows: rows.map(rowToContract) }
  }

  async getMap(organizationId: string, locale: string = DEFAULT_LOCALE): Promise<LabelMapOutput> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select({ namespace: labels.namespace, key: labels.key, value: labels.value })
      .from(labels)
      .where(
        and(
          eq(labels.organizationId, organizationId),
          eq(labels.locale, locale),
          sql`${labels.deletedAt} IS NULL`,
        ),
      )
    const map: LabelMapOutput = {}
    for (const r of rows) map[`${r.namespace}.${r.key}`] = r.value
    return map
  }

  async upsert(input: LabelUpsertInput): Promise<Label> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const locale = input.locale ?? DEFAULT_LOCALE
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(labels)
        .where(
          and(
            eq(labels.organizationId, input.organizationId),
            eq(labels.namespace, input.namespace),
            eq(labels.key, input.key),
            eq(labels.locale, locale),
          ),
        )
        .limit(1)

      const values = {
        organizationId: input.organizationId,
        namespace: input.namespace,
        key: input.key,
        locale,
        value: input.value,
        description: input.description ?? null,
      }

      const [row] = await tx
        .insert(labels)
        .values(values)
        .onConflictDoUpdate({
          target: [labels.organizationId, labels.namespace, labels.key, labels.locale],
          set: {
            value: input.value,
            description: input.description ?? null,
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'label',
        entityId: row!.id,
        action: before ? 'update' : 'create',
        actorUserId: this.actorUserId(),
        before: before ? { value: before.value } : null,
        after: { namespace: input.namespace, key: input.key, value: input.value },
      })

      return rowToContract(row!)
    })
  }

  async bulkUpsert(input: LabelBulkUpsertInput): Promise<LabelListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const locale = input.locale ?? DEFAULT_LOCALE
    const out: Label[] = []
    for (const e of input.entries) {
      out.push(
        await this.upsert({
          organizationId: input.organizationId,
          namespace: e.namespace,
          key: e.key,
          locale,
          value: e.value,
          description: e.description,
        }),
      )
    }
    return { rows: out }
  }

  async delete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(labels)
        .where(and(eq(labels.id, id), eq(labels.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Label override not found')
      await tx
        .update(labels)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(labels.id, id), eq(labels.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'label',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { namespace: before.namespace, key: before.key, value: before.value },
      })
    })
  }

  async getBranding(organizationId: string): Promise<Branding> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(orgBranding)
      .where(eq(orgBranding.organizationId, organizationId))
      .limit(1)
    if (!row) return syntheticBranding(organizationId)
    return brandingRowToContract(row)
  }

  async updateBranding(input: BrandingUpdateInput): Promise<Branding> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(orgBranding)
        .where(eq(orgBranding.organizationId, input.organizationId))
        .limit(1)

      // Build the insert shape: only set columns whose default-vs-undefined
      // semantics demand explicit propagation. Drizzle defaults fill the
      // rest.
      const insertValues: Record<string, unknown> = {
        organizationId: input.organizationId,
      }
      if (input.logoUrl !== undefined) insertValues.logoUrl = input.logoUrl
      if (input.primaryColor !== undefined) insertValues.primaryColor = input.primaryColor
      if (input.accentColor !== undefined) insertValues.accentColor = input.accentColor
      if (input.footerText !== undefined) insertValues.footerText = input.footerText
      if (input.supportEmail !== undefined) insertValues.supportEmail = input.supportEmail
      if (input.supportPhone !== undefined) insertValues.supportPhone = input.supportPhone
      if (input.licenseLabel !== undefined) insertValues.licenseLabel = input.licenseLabel
      if (input.timezone !== undefined) insertValues.timezone = input.timezone
      if (input.currencyCode !== undefined) insertValues.currencyCode = input.currencyCode
      if (input.dateFormat !== undefined) insertValues.dateFormat = input.dateFormat

      const updateValues: Record<string, unknown> = { updatedAt: new Date() }
      for (const k of Object.keys(insertValues)) {
        if (k !== 'organizationId') updateValues[k] = insertValues[k]
      }

      const [row] = await tx
        .insert(orgBranding)
        .values(insertValues as typeof orgBranding.$inferInsert)
        .onConflictDoUpdate({
          target: orgBranding.organizationId,
          set: updateValues,
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'org_branding',
        entityId: row!.id,
        action: before ? 'update' : 'create',
        actorUserId: this.actorUserId(),
        before: before ? { primaryColor: before.primaryColor, accentColor: before.accentColor, logoUrl: before.logoUrl } : null,
        after: { primaryColor: row!.primaryColor, accentColor: row!.accentColor, logoUrl: row!.logoUrl },
      })

      return brandingRowToContract(row!)
    })
  }
}
