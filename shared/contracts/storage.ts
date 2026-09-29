/**
 * shared/contracts/storage.ts — object-storage contract (L01-S1 / ADR-0001).
 *
 * # What this file does
 *   - Declares the per-entity upload rules (MIME allow-list + size cap), the
 *     storage-object-key shape, and the presign request/response shapes used by
 *     the L01-S2 presign endpoints.
 *   - Pure Zod + plain helpers — no Node/AWS imports — so it is safe to import
 *     from both client and server.
 *
 * # Decisions (ADR-0001)
 *   - Keys are `{tenantId}/{entity}/{entityId}/{uuid}.{ext}` — tenant-prefixed so
 *     a future per-tenant bucket/policy is a driver concern, not a schema change.
 *   - The KEY is the persisted value; services never store a URL. Reads mint a
 *     short-lived signed URL. This keeps bucket layout + credentials server-side
 *     and removes base64 bloat from the DB.
 *   - Per-entity rules live here (one source of truth) so the presign endpoint,
 *     the client widgets, and the tests all agree on what's allowed.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

// ----------------------------------------------------------------------------
// Entity kinds + per-entity upload rules.
// ----------------------------------------------------------------------------
export const StorageEntityKindSchema = z.enum([
  'property_photo',
  'property_attachment',
  'avatar',
  'branding_logo',
  'document',
])
export type StorageEntityKind = z.infer<typeof StorageEntityKindSchema>

export interface StorageEntityRule {
  readonly mimeAllow: readonly string[]
  readonly maxBytes: number
}

const MB = 1024 * 1024

export const STORAGE_ENTITY_RULES: Record<StorageEntityKind, StorageEntityRule> = {
  property_photo: { mimeAllow: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 15 * MB },
  property_attachment: {
    mimeAllow: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxBytes: 25 * MB,
  },
  avatar: { mimeAllow: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 2 * MB },
  branding_logo: {
    // SVG intentionally excluded: a malicious SVG is stored-XSS if ever served
    // inline same-origin. Raster logos only. (L01-S2 skeptic P2-3.)
    mimeAllow: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 2 * MB,
  },
  document: { mimeAllow: ['application/pdf'], maxBytes: 25 * MB },
}

/** Canonical MIME → file extension used when minting a key. */
export const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// ----------------------------------------------------------------------------
// Object key. Lenient 36-char segments (NOT strict RFC-4122) so non-RFC fixture
// ids used in mock/test flows still round-trip (the E3-S4 fixture-id lesson).
// ----------------------------------------------------------------------------
export const StorageObjectKeySchema = z
  .string()
  .regex(
    // Filename: `{uuid}` for a finalized object, `s-{uuid}-{mac}` for a staged
    // upload (WP-L02 review: staged keys are never persistable; see keys.ts).
    /^[0-9a-fA-F-]{36}\/(property_photo|property_attachment|avatar|branding_logo|document)\/[0-9a-fA-F-]{36}\/(?:s-[0-9a-fA-F-]{36}-[0-9a-f]{16}|[0-9a-fA-F-]{36})\.[a-z0-9]+$/,
    'Invalid storage object key',
  )
export type StorageObjectKey = z.infer<typeof StorageObjectKeySchema>

// ----------------------------------------------------------------------------
// Presign request / response shapes (consumed by L01-S2 endpoints).
// ----------------------------------------------------------------------------
export const PresignUploadInputSchema = z.object({
  organizationId: UuidSchema,
  entity: StorageEntityKindSchema,
  entityId: UuidSchema,
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})
export type PresignUploadInput = z.infer<typeof PresignUploadInputSchema>

export const PresignUploadOutputSchema = z.object({
  key: StorageObjectKeySchema,
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
})
export type PresignUploadOutput = z.infer<typeof PresignUploadOutputSchema>

export const PresignDownloadInputSchema = z.object({
  organizationId: UuidSchema,
  key: StorageObjectKeySchema,
  downloadFilename: z.string().max(255).optional(),
})
export type PresignDownloadInput = z.infer<typeof PresignDownloadInputSchema>

export const PresignDownloadOutputSchema = z.object({
  url: z.string(),
  expiresAt: z.string().datetime(),
})
export type PresignDownloadOutput = z.infer<typeof PresignDownloadOutputSchema>

// ----------------------------------------------------------------------------
// Finalize. A SigV4 presigned PUT cannot bind body size, so the client-declared
// `sizeBytes` at presign time is only advisory. After the client PUTs, the server
// HEADs the stored object and enforces the entity's real size + content-type rule
// (deleting on violation). Owning services persist the key only after finalize ok.
// ----------------------------------------------------------------------------
export const FinalizeUploadInputSchema = z.object({
  organizationId: UuidSchema,
  key: StorageObjectKeySchema,
})
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadInputSchema>

export const FinalizeUploadOutputSchema = z.object({
  key: StorageObjectKeySchema,
  size: z.number().int().nonnegative(),
  contentType: z.string(),
})
export type FinalizeUploadOutput = z.infer<typeof FinalizeUploadOutputSchema>

// ----------------------------------------------------------------------------
// Storage health (L01-S4). Admin-only report: is the active driver reachable
// AND writable, and how many legacy placeholder rows remain per asset column
// (the read-only census L02 migrates against).
// ----------------------------------------------------------------------------
export const StorageProbeResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().optional(),
})
export type StorageProbeResultShape = z.infer<typeof StorageProbeResultSchema>

export const LegacyAssetCountSchema = z.object({
  table: z.string(),
  column: z.string(),
  count: z.number().int().nonnegative(),
  /** True when inline storage is intentional today (avatars until L02-S3). */
  intentionalInline: z.boolean(),
})
export type LegacyAssetCountShape = z.infer<typeof LegacyAssetCountSchema>

export const StorageHealthOutputSchema = z.object({
  ts: z.string().datetime(),
  driver: z.enum(['r2', 'fs']),
  probe: StorageProbeResultSchema,
  legacyAssets: z.array(LegacyAssetCountSchema),
  organizationId: UuidSchema,
})
export type StorageHealthOutput = z.infer<typeof StorageHealthOutputSchema>

// ----------------------------------------------------------------------------
// Upload validation — shared by the presign endpoint and the client widgets.
// ----------------------------------------------------------------------------
export type UploadValidation = { ok: true } | { ok: false; reason: string }

export function validateUpload(
  entity: StorageEntityKind,
  contentType: string,
  sizeBytes: number,
): UploadValidation {
  const rule = STORAGE_ENTITY_RULES[entity]
  if (!rule.mimeAllow.includes(contentType)) {
    return { ok: false, reason: `Unsupported content type "${contentType}" for ${entity}` }
  }
  if (sizeBytes <= 0) return { ok: false, reason: 'Empty upload' }
  if (sizeBytes > rule.maxBytes) {
    return { ok: false, reason: `Exceeds ${rule.maxBytes}-byte limit for ${entity}` }
  }
  if (!MIME_EXTENSION[contentType]) {
    return { ok: false, reason: `No extension mapping for "${contentType}"` }
  }
  return { ok: true }
}
