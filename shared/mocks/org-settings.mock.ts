/**
 * shared/mocks/org-settings.mock.ts — MockOrgSettingsService
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * Singleton-per-org. `get()` synthesises a row with `ORG_SETTINGS_DEFAULTS`
 * on first call (mirrors branding pattern).
 */
import {
  type IOrgSettingsService,
  type OrgSettings,
  type OrgSettingsUpdateInput,
  ORG_SETTINGS_DEFAULTS,
} from '../contracts/org-settings'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: OrgSettings[] = []
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function synth(organizationId: string): OrgSettings {
  const now = nowIso()
  return {
    id: newId(),
    organizationId,
    ...ORG_SETTINGS_DEFAULTS,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export class MockOrgSettingsService implements IOrgSettingsService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async get(organizationId: string): Promise<OrgSettings> {
    assertSameTenant(this.tenantResolver, organizationId)
    let row = rows.find((r) => r.organizationId === organizationId)
    if (!row) {
      row = synth(organizationId)
      rows.push(row)
    }
    return row
  }

  async update(input: OrgSettingsUpdateInput): Promise<OrgSettings> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const row = await this.get(input.organizationId)
    if (input.quoteNumberFormat !== undefined) row.quoteNumberFormat = input.quoteNumberFormat
    if (input.woNumberFormat !== undefined) row.woNumberFormat = input.woNumberFormat
    if (input.invoiceNumberFormat !== undefined) row.invoiceNumberFormat = input.invoiceNumberFormat
    if (input.defaultMarkupBps !== undefined) row.defaultMarkupBps = input.defaultMarkupBps
    if (input.defaultTaxBps !== undefined) row.defaultTaxBps = input.defaultTaxBps
    if (input.defaultQuoteExpiryDays !== undefined) row.defaultQuoteExpiryDays = input.defaultQuoteExpiryDays
    if (input.defaultInvoiceTermsDays !== undefined) row.defaultInvoiceTermsDays = input.defaultInvoiceTermsDays
    if (input.defaultSlaDaysAssessment !== undefined) row.defaultSlaDaysAssessment = input.defaultSlaDaysAssessment
    if (input.defaultSlaDaysQuote !== undefined) row.defaultSlaDaysQuote = input.defaultSlaDaysQuote
    row.updatedAt = nowIso()
    return row
  }
}
