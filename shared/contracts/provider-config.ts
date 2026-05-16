/**
 * shared/contracts/provider-config.ts — per-org provider configuration
 * (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008, ADR-0021)
 *   - **One ACTIVE row per (org, kind).** Inactive rows persist as
 *     history. The Settings page renders one section per `kind`; an
 *     active row drives the "Configured" pill, an inactive row drives
 *     the "Inactive" pill.
 *   - **Per-provider Zod for `config`.** Each kind/provider tuple has
 *     a strict Zod shape (resend → apiKey + fromAddress; twilio →
 *     accountSid + authToken + from; r2 → bucket + endpoint + access +
 *     secret; puppeteer → empty). `ProviderConfigUpsertInputSchema`
 *     stays loose (`record(unknown)`); the service refines using
 *     `PROVIDER_CONFIG_ZOD[provider]` before persisting.
 *   - **Secrets are stored AS-IS in JSONB for Phase 1.** Tracked as
 *     a sec-debt in the W2-4 handoff: W3-1 (the actual send/upload
 *     wiring) introduces KMS / pgcrypto encryption. Today the row is
 *     org-isolated and admin-only.
 *   - **`provider` lives in text columns** (no DB enum). New providers
 *     ship without a migration — only a Zod refinement.
 */
import { z } from 'zod'
import { AuditFieldsSchema, UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Provider enums.
// ----------------------------------------------------------------------------
export const ProviderKindSchema = z.enum(['email', 'sms', 'storage', 'pdf'])
export type ProviderKind = z.infer<typeof ProviderKindSchema>

export const ProviderSchema = z.enum(['resend', 'twilio', 'r2', 'puppeteer'])
export type Provider = z.infer<typeof ProviderSchema>

/** Catalog of (kind → providers). */
export const PROVIDERS_BY_KIND: Record<ProviderKind, Provider[]> = {
  email: ['resend'],
  sms: ['twilio'],
  storage: ['r2'],
  pdf: ['puppeteer'],
}

// ----------------------------------------------------------------------------
// Per-provider config shapes.
// ----------------------------------------------------------------------------
export const ResendConfigSchema = z.object({
  apiKey: z.string().min(1),
  fromAddress: z.string().email(),
})
export const TwilioConfigSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  from: z.string().min(1),
})
export const R2ConfigSchema = z.object({
  bucket: z.string().min(1),
  endpoint: z.string().url(),
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
})
export const PuppeteerConfigSchema = z.object({}).strict()

export const PROVIDER_CONFIG_ZOD: Record<Provider, z.ZodTypeAny> = {
  resend: ResendConfigSchema,
  twilio: TwilioConfigSchema,
  r2: R2ConfigSchema,
  puppeteer: PuppeteerConfigSchema,
}

// ----------------------------------------------------------------------------
// Row + inputs.
// ----------------------------------------------------------------------------
export const ProviderConfigSchema = z
  .object({
    id: UuidSchema,
    organizationId: UuidSchema,
    kind: ProviderKindSchema,
    provider: ProviderSchema,
    config: z.record(z.unknown()),
    isActive: z.boolean(),
  })
  .merge(AuditFieldsSchema)
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

export const ProviderConfigUpsertInputSchema = z.object({
  organizationId: UuidSchema,
  kind: ProviderKindSchema,
  provider: ProviderSchema,
  config: z.record(z.unknown()),
})
export type ProviderConfigUpsertInput = z.infer<typeof ProviderConfigUpsertInputSchema>

// ----------------------------------------------------------------------------
// Service interface.
// ----------------------------------------------------------------------------
export interface IProviderConfigService {
  list(organizationId: string): Promise<{ rows: ProviderConfig[] }>
  get(organizationId: string, kind: ProviderKind): Promise<ProviderConfig | null>
  /**
   * Insert or update the (org, kind, provider) config. Marks the new
   * row active and any prior active row inactive (one-active-per-kind).
   * Validates `config` against the per-provider Zod.
   */
  upsert(input: ProviderConfigUpsertInput): Promise<ProviderConfig>
  /** Re-activate a previously inactive row (e.g. switch providers back). */
  activate(id: string, organizationId: string): Promise<ProviderConfig>
}
