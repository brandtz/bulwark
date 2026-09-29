/**
 * server/services/storage/keys.ts — storage key generation + parsing (L01-S1).
 *
 * Key shape: `{tenantId}/{entity}/{entityId}/{uuid}.{ext}` (ADR-0001). The uuid
 * makes every upload unique even for the same entity, so re-uploads never clobber
 * and the key is safe to use as an R2 object key or a filesystem path.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  MIME_EXTENSION,
  StorageObjectKeySchema,
  type StorageEntityKind,
} from '../../../shared/contracts/storage'

export interface BuildKeyInput {
  tenantId: string
  entity: StorageEntityKind
  entityId: string
  contentType: string
}

/** Mint a fresh storage key for an upload. Throws on an unmappable content type. */
export function buildStorageKey(input: BuildKeyInput): string {
  const ext = MIME_EXTENSION[input.contentType]
  if (!ext) throw new Error(`Unsupported content type: ${input.contentType}`)
  return `${input.tenantId}/${input.entity}/${input.entityId}/${randomUUID()}.${ext}`
}

/**
 * Staging keys (WP-L02 review P0). Presign mints `…/s-{uuid}-{mac}.{ext}`; only
 * finalize may consume one, and it copies the object to a fresh finalized key
 * (`…/{uuid}.{ext}`). Owning services refuse staging keys, so an upload cannot
 * be persisted without finalize's size/type check, and finalize never touches
 * (or deletes) a persisted object. The mac binds the staged key to the user who
 * presigned it, so nobody else can finalize it.
 */
function stagingSecret(): string {
  const secret = process.env.NUXT_SESSION_PASSWORD || process.env.JWT_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') throw new Error('NUXT_SESSION_PASSWORD is required to sign upload keys')
  return 'bulwark-dev-staging-key'
}

function stagingMac(prefix: string, uuid: string, userId: string): string {
  return createHmac('sha256', stagingSecret()).update(`${prefix}|${uuid}|${userId}`).digest('hex').slice(0, 16)
}

const STAGING_FILE = /^s-([0-9a-fA-F-]{36})-([0-9a-f]{16})\.[a-z0-9]+$/

/** Mint a staging key for a presigned upload, bound to `userId`. */
export function buildStagingKey(input: BuildKeyInput, userId: string): string {
  const ext = MIME_EXTENSION[input.contentType]
  if (!ext) throw new Error(`Unsupported content type: ${input.contentType}`)
  const prefix = `${input.tenantId}/${input.entity}/${input.entityId}`
  const uuid = randomUUID()
  return `${prefix}/s-${uuid}-${stagingMac(prefix, uuid, userId)}.${ext}`
}

export function isStagingKey(key: string): boolean {
  return STAGING_FILE.test(key.split('/').pop() ?? '')
}

/** True when `key` is a staging key minted for `userId`. */
export function stagingKeyBelongsTo(key: string, userId: string): boolean {
  const parts = key.split('/')
  const m = STAGING_FILE.exec(parts.pop() ?? '')
  if (!m) return false
  const expected = Buffer.from(stagingMac(parts.join('/'), m[1]!, userId))
  const given = Buffer.from(m[2]!)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export interface ParsedKey {
  tenantId: string
  entity: string
  entityId: string
  filename: string
}

/** Validate + split a storage key. Throws (via Zod) on a malformed/traversal key. */
export function parseStorageKey(key: string): ParsedKey {
  StorageObjectKeySchema.parse(key)
  const [tenantId, entity, entityId, filename] = key.split('/')
  return { tenantId: tenantId!, entity: entity!, entityId: entityId!, filename: filename! }
}
