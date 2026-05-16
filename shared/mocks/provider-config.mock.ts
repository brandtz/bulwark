/**
 * shared/mocks/provider-config.mock.ts — MockProviderConfigService
 * (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008)
 *   - Module-level row store. `upsert()` enforces one-active-per-
 *     (org,kind) by deactivating siblings.
 *   - Per-provider Zod from contract refines `config` shape before
 *     persist. Invalid shapes raise.
 */
import type {
  IProviderConfigService,
  ProviderConfig,
  ProviderConfigUpsertInput,
  ProviderKind,
} from '../contracts/provider-config'
import { PROVIDER_CONFIG_ZOD } from '../contracts/provider-config'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: ProviderConfig[] = []

export class MockProviderConfigService implements IProviderConfigService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: ProviderConfig[] }> {
    assertSameTenant(this.resolver, organizationId)
    return {
      rows: rows.filter((r) => r.organizationId === organizationId && r.deletedAt === null),
    }
  }

  async get(organizationId: string, kind: ProviderKind): Promise<ProviderConfig | null> {
    assertSameTenant(this.resolver, organizationId)
    return (
      rows.find(
        (r) =>
          r.organizationId === organizationId &&
          r.kind === kind &&
          r.isActive &&
          r.deletedAt === null,
      ) ?? null
    )
  }

  async upsert(input: ProviderConfigUpsertInput): Promise<ProviderConfig> {
    assertSameTenant(this.resolver, input.organizationId)
    const zod = PROVIDER_CONFIG_ZOD[input.provider]
    const parsed = zod.parse(input.config) as Record<string, unknown>

    // Deactivate any current active row of the same kind.
    for (const r of rows) {
      if (
        r.organizationId === input.organizationId &&
        r.kind === input.kind &&
        r.isActive &&
        r.deletedAt === null
      ) {
        r.isActive = false
        r.updatedAt = new Date().toISOString()
      }
    }

    // Reactivate-with-update if a (provider, kind) tuple already exists.
    const existing = rows.find(
      (r) =>
        r.organizationId === input.organizationId &&
        r.kind === input.kind &&
        r.provider === input.provider &&
        r.deletedAt === null,
    )
    const now = new Date().toISOString()
    if (existing) {
      existing.config = parsed
      existing.isActive = true
      existing.updatedAt = now
      return existing
    }
    const row: ProviderConfig = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      kind: input.kind,
      provider: input.provider,
      config: parsed,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async activate(id: string, organizationId: string): Promise<ProviderConfig> {
    assertSameTenant(this.resolver, organizationId)
    const row = rows.find((r) => r.id === id && r.organizationId === organizationId)
    if (!row) throw new Error('Provider config not found')
    for (const r of rows) {
      if (r.organizationId === organizationId && r.kind === row.kind && r.id !== id) {
        if (r.isActive) {
          r.isActive = false
          r.updatedAt = new Date().toISOString()
        }
      }
    }
    row.isActive = true
    row.updatedAt = new Date().toISOString()
    return row
  }
}

export function __resetMockProviderConfigsForTests(): void {
  rows.length = 0
}
