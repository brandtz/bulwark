/**
 * server/services/storage/keys.ts — storage key generation + parsing (L01-S1).
 *
 * Key shape: `{tenantId}/{entity}/{entityId}/{uuid}.{ext}` (ADR-0001). The uuid
 * makes every upload unique even for the same entity, so re-uploads never clobber
 * and the key is safe to use as an R2 object key or a filesystem path.
 */
import { randomUUID } from 'node:crypto'
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
