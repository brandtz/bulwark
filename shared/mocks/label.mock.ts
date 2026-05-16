/**
 * shared/mocks/label.mock.ts — MockLabelService (EH-B / W1-2 / ADR-0014).
 *
 * What this file does:
 *   - In-memory implementation of `ILabelService`. Two stores:
 *       1. `overrideRows` — every override row, keyed by uuid.
 *       2. `brandingRows` — one branding row per org.
 *   - Composite uniqueness on `(orgId, namespace, key, locale)` for
 *     overrides; upsert by that composite key.
 *
 * Decisions captured here (ADR-0008, ADR-0014):
 *   - **Clean slate seed** — NO override rows ship in fixtures. Defaults
 *     come from `shared/labels/defaults.ts`. This matches the production
 *     install path (admins install with zero overrides) and makes the
 *     pilot test honest: "override Lead → Prospect, see Prospect render".
 *   - **`getMap()` returns ONLY overrides** — the composable merges with
 *     `DEFAULT_LABELS`. A mock that pre-merges would hide the override
 *     vs default distinction from tests.
 *   - **Branding row auto-created on first read.** `getBranding()`
 *     synthesises a defaults-only row if the tenant has never customised,
 *     mirroring the standards mock pattern (single-branch read path).
 *   - **Tenant-firewalled** per E2-S7: every method runs
 *     `assertSameTenant` before touching state.
 *
 * Decisions NOT taken:
 *   - We considered persisting to localStorage. Rejected — mock state
 *     should be fresh per dev-server start; persistence would make
 *     "reset by restarting" a lie. The real backend handles persistence.
 *   - We considered validating namespace at the mock layer with Zod.
 *     The API dispatcher already runs Zod at the boundary; doing it
 *     twice slows tests. Mocks trust their inputs.
 */
import type {
  Branding,
  BrandingUpdateInput,
  ILabelService,
  Label,
  LabelBulkUpsertInput,
  LabelListInput,
  LabelListOutput,
  LabelMapOutput,
  LabelUpsertInput,
} from '../contracts/label'
import { DEFAULT_LOCALE } from '../contracts/label'
import { assertSameTenant, type TenantResolver } from './tenant'

const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

// Module-level stores survive across `useService` calls in the same process
// (matches the rest of the mock fleet). `__resetMockLabelsForTests` clears.
const overrideRows: Label[] = []
const brandingRows = new Map<string, Branding>()

function defaultBranding(orgId: string): Branding {
  const now = nowIso()
  return {
    id: newId(),
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

export class MockLabelService implements ILabelService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(input: LabelListInput): Promise<LabelListOutput> {
    assertSameTenant(this.resolver, input.organizationId)
    const locale = input.locale ?? DEFAULT_LOCALE
    let scoped = overrideRows.filter(
      (r) =>
        r.organizationId === input.organizationId &&
        r.locale === locale &&
        r.deletedAt === null,
    )
    if (input.namespace) scoped = scoped.filter((r) => r.namespace === input.namespace)
    return { rows: scoped }
  }

  async getMap(organizationId: string, locale: string = DEFAULT_LOCALE): Promise<LabelMapOutput> {
    assertSameTenant(this.resolver, organizationId)
    const map: LabelMapOutput = {}
    for (const r of overrideRows) {
      if (r.organizationId !== organizationId) continue
      if (r.locale !== locale) continue
      if (r.deletedAt !== null) continue
      map[`${r.namespace}.${r.key}`] = r.value
    }
    return map
  }

  async upsert(input: LabelUpsertInput): Promise<Label> {
    assertSameTenant(this.resolver, input.organizationId)
    const locale = input.locale ?? DEFAULT_LOCALE
    const existing = overrideRows.find(
      (r) =>
        r.organizationId === input.organizationId &&
        r.namespace === input.namespace &&
        r.key === input.key &&
        r.locale === locale &&
        r.deletedAt === null,
    )
    if (existing) {
      existing.value = input.value
      if (input.description !== undefined) existing.description = input.description ?? null
      existing.updatedAt = nowIso()
      return existing
    }
    const now = nowIso()
    const row: Label = {
      id: newId(),
      organizationId: input.organizationId,
      namespace: input.namespace,
      key: input.key,
      locale,
      value: input.value,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    overrideRows.push(row)
    return row
  }

  async bulkUpsert(input: LabelBulkUpsertInput): Promise<LabelListOutput> {
    assertSameTenant(this.resolver, input.organizationId)
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
    assertSameTenant(this.resolver, organizationId)
    const row = overrideRows.find((r) => r.id === id && r.organizationId === organizationId)
    if (!row) throw new Error('Label override not found')
    row.deletedAt = nowIso()
  }

  async getBranding(organizationId: string): Promise<Branding> {
    assertSameTenant(this.resolver, organizationId)
    const existing = brandingRows.get(organizationId)
    if (existing) return existing
    return defaultBranding(organizationId)
  }

  async updateBranding(input: BrandingUpdateInput): Promise<Branding> {
    assertSameTenant(this.resolver, input.organizationId)
    const existing = brandingRows.get(input.organizationId) ?? defaultBranding(input.organizationId)
    const next: Branding = {
      ...existing,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing.logoUrl,
      primaryColor: input.primaryColor ?? existing.primaryColor,
      accentColor: input.accentColor ?? existing.accentColor,
      footerText: input.footerText !== undefined ? input.footerText : existing.footerText,
      supportEmail: input.supportEmail !== undefined ? input.supportEmail : existing.supportEmail,
      supportPhone: input.supportPhone !== undefined ? input.supportPhone : existing.supportPhone,
      licenseLabel: input.licenseLabel !== undefined ? input.licenseLabel : existing.licenseLabel,
      timezone: input.timezone ?? existing.timezone,
      currencyCode: input.currencyCode ?? existing.currencyCode,
      dateFormat: input.dateFormat ?? existing.dateFormat,
      updatedAt: nowIso(),
    }
    brandingRows.set(input.organizationId, next)
    return next
  }
}

export function __resetMockLabelsForTests(): void {
  overrideRows.length = 0
  brandingRows.clear()
}
