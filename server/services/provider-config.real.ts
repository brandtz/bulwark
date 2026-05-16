/**
 * server/services/provider-config.real.ts — RealProviderConfigService
 * (W2-4 / EH-H Part B / ADR-0021, sealed in W5-2 / ADR-0036).
 *
 * # Decisions (ADR-0008, ADR-0036)
 *   - `upsert` enforces one-active-per-(org,kind) by marking any prior
 *     active row inactive in the same tx before inserting the new one.
 *     The partial unique index on the table backs this up.
 *   - `config` is Zod-validated per-provider here (NOT in the contract
 *     surface) so the table can grow new providers without contract
 *     churn.
 *   - **Secrets are sealed at rest with AES-GCM** (W5-2 / ADR-0036).
 *     The plaintext payload never lands in the legacy `config` JSONB
 *     column on new writes — it lives encrypted in `config_encrypted`.
 *     Reads transparently decrypt; pre-W5-2 rows are still readable
 *     via the legacy column as a backfill seam.
 *   - `rowToContract` always returns the decrypted shape so callers
 *     (Settings UI, the `_providers/*` adapters) keep using
 *     `config.apiKey` etc. without churn.
 */
import { and, desc, eq } from 'drizzle-orm'
import type {
  IProviderConfigService,
  ProviderConfig,
  ProviderConfigUpsertInput,
  ProviderKind,
} from '../../shared/contracts/provider-config'
import { PROVIDER_CONFIG_ZOD } from '../../shared/contracts/provider-config'
import { providerConfigs } from '../db/schema/provider_configs'
import type { ProviderConfigRow } from '../db/schema/provider_configs'
import { getDb } from '../db/client'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { encryptJsonBlob, decryptJsonBlob } from '../utils/crypto'
import { log } from '../utils/logger'

/**
 * Decrypt the row's sealed blob, falling back to the legacy plaintext
 * `config` column for pre-W5-2 rows. We log (no payload) when the seal
 * is unreadable so ops sees corruption, but degrade to an empty config
 * rather than throw — the provider adapters already handle "missing
 * config → stub" gracefully.
 */
export function unsealProviderConfig(row: ProviderConfigRow): Record<string, unknown> {
  if (row.configEncrypted) {
    try {
      return decryptJsonBlob<Record<string, unknown>>(row.configEncrypted)
    } catch (err) {
      log('error', 'provider_config.unseal_failed', {
        providerConfigId: row.id,
        kind: row.kind,
        provider: row.provider,
        error: err instanceof Error ? err.message : 'unknown',
      })
      return {}
    }
  }
  return (row.config ?? {}) as Record<string, unknown>
}

function rowToContract(r: ProviderConfigRow): ProviderConfig {
  return {
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind as ProviderConfig['kind'],
    provider: r.provider as ProviderConfig['provider'],
    config: unsealProviderConfig(r),
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealProviderConfigService implements IProviderConfigService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(organizationId: string): Promise<{ rows: ProviderConfig[] }> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.organizationId, organizationId))
      .orderBy(desc(providerConfigs.createdAt))
    return { rows: rows.map(rowToContract) }
  }

  async get(organizationId: string, kind: ProviderKind): Promise<ProviderConfig | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(providerConfigs)
      .where(
        and(
          eq(providerConfigs.organizationId, organizationId),
          eq(providerConfigs.kind, kind),
          eq(providerConfigs.isActive, true),
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async upsert(input: ProviderConfigUpsertInput): Promise<ProviderConfig> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const zod = PROVIDER_CONFIG_ZOD[input.provider]
    const parsed = zod.parse(input.config)

    return await withAudit(async ({ tx, audit }) => {
      // Deactivate any existing active row for this (org, kind).
      await tx
        .update(providerConfigs)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(providerConfigs.organizationId, input.organizationId),
            eq(providerConfigs.kind, input.kind),
            eq(providerConfigs.isActive, true),
          ),
        )

      // Insert the new active row. W5-2 / ADR-0036: the validated
      // payload is sealed via AES-GCM and the legacy `config` JSONB
      // column is written as an empty object so plaintext never
      // touches new rows.
      const sealed = encryptJsonBlob(parsed)
      const [row] = await tx
        .insert(providerConfigs)
        .values({
          organizationId: input.organizationId,
          kind: input.kind,
          provider: input.provider,
          config: {},
          configEncrypted: sealed,
          isActive: true,
        })
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'provider_config',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { kind: input.kind, provider: input.provider },
      })
      return rowToContract(row!)
    })
  }

  async activate(id: string, organizationId: string): Promise<ProviderConfig> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [target] = await tx
        .select()
        .from(providerConfigs)
        .where(and(eq(providerConfigs.id, id), eq(providerConfigs.organizationId, organizationId)))
        .limit(1)
      if (!target) throw new Error('Provider config not found')

      await tx
        .update(providerConfigs)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(providerConfigs.organizationId, organizationId),
            eq(providerConfigs.kind, target.kind),
            eq(providerConfigs.isActive, true),
          ),
        )

      const [row] = await tx
        .update(providerConfigs)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(providerConfigs.id, id))
        .returning()

      await audit.record({
        organizationId,
        entityType: 'provider_config',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'activate' },
      })
      return rowToContract(row!)
    })
  }
}
