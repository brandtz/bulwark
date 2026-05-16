/**
 * server/db/schema/provider_configs.ts — per-org provider configuration
 * (Wave 2 / EH-H Part B / W2-4, sealed in W5-2 / ADR-0036).
 *
 * # Decisions (ADR-0008, ADR-0036)
 *   - Phase 1 stores the config; Phase 3 (W3-1) wires the actual
 *     send/upload paths. Today's payload is opaque JSONB validated by
 *     Zod at the contract layer (per-provider shape).
 *   - One ACTIVE config per (org, kind) — enforced by partial unique
 *     index. Inactive rows are kept as history so toggling back is
 *     a one-click affair.
 *   - `kind` and `provider` are text (Zod-bounded) so a new provider
 *     ships without a migration.
 *   - **Sealed at rest (W5-2 / ADR-0036).** `config_encrypted` holds
 *     a base64 AES-GCM envelope of the JSON-stringified config blob
 *     (see `server/utils/crypto.ts`). The legacy `config` JSONB
 *     column is retained for backfill — readers prefer
 *     `config_encrypted` and fall back to `config` only when the
 *     encrypted column is null (pre-W5-2 rows). Writers always set
 *     `config_encrypted` and zero out `config` so plaintext drains
 *     organically; a follow-up migration drops `config` once ops
 *     confirms the backfill is complete.
 */
import { pgTable, text, uuid, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { auditColumns, orgColumn } from './_shared'

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgColumn,
    /** `email | sms | storage | pdf` (Zod-bounded). */
    kind: text('kind').notNull(),
    /** `resend | twilio | r2 | puppeteer` (Zod-bounded per kind). */
    provider: text('provider').notNull(),
    /**
     * Legacy plaintext blob. Retained for backfill of pre-W5-2 rows.
     * New writes set this to `{}` and place the real payload in
     * `configEncrypted` (ADR-0036).
     */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    /**
     * AES-GCM-sealed JSON blob (base64 iv|tag|ciphertext). See
     * `server/utils/crypto.ts#encryptJsonBlob`. Nullable so the
     * column can land via additive migration; readers treat null as
     * "fall back to legacy `config`".
     */
    configEncrypted: text('config_encrypted'),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    activePerKindUnique: uniqueIndex('provider_configs_active_per_kind_unique')
      .on(t.organizationId, t.kind)
      .where(sql`is_active = true AND deleted_at IS NULL`),
  }),
)

export type ProviderConfigRow = typeof providerConfigs.$inferSelect
export type NewProviderConfigRow = typeof providerConfigs.$inferInsert
