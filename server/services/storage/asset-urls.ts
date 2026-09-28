/**
 * server/services/storage/asset-urls.ts — owning-service side of asset uploads
 * (WP-L02, epic L02 key decisions).
 *
 * - Write: a service persists the finalized storage KEY. `assertOwnedAssetKey`
 *   proves the key is under the caller's tenant and the expected entity kind and
 *   that the object exists (finalize already verified size/type and moved it to a
 *   never-presigned key).
 * - Read: `signAssetUrl` swaps a stored key for a short-lived signed GET URL so
 *   client code that expects a URL keeps working. Legacy absolute URLs pass
 *   through unchanged (the backfill script re-homes data:/local:// rows).
 */
import { StorageObjectKeySchema, type StorageEntityKind } from '../../../shared/contracts/storage'
import { getStorage } from './index'
import { parseStorageKey } from './keys'

const READ_TTL_SECONDS = 60 * 60

export function isStorageKey(value: string | null | undefined): value is string {
  return !!value && StorageObjectKeySchema.safeParse(value).success
}

/** Throws (message starts with "Invalid" → HTTP 400) unless `value` is a usable key for this tenant + entity. */
export async function assertOwnedAssetKey(value: string, organizationId: string, entity: StorageEntityKind): Promise<void> {
  if (!isStorageKey(value)) return // absolute URLs are guarded by assertStorableUrlOrKey
  const parsed = parseStorageKey(value)
  if (parsed.tenantId !== organizationId) throw new Error('Invalid asset: object belongs to another organization')
  if (parsed.entity !== entity) throw new Error(`Invalid asset: expected a ${entity} upload`)
  const head = await getStorage().headObject(value)
  if (!head.exists) throw new Error('Invalid asset: upload not found (finalize it first)')
}

export async function signAssetUrl(value: string, filename?: string): Promise<string>
export async function signAssetUrl(value: string | null, filename?: string): Promise<string | null>
export async function signAssetUrl(value: string | null, filename?: string): Promise<string | null> {
  if (!isStorageKey(value)) return value
  const signed = await getStorage().getSignedDownloadUrl({ key: value, expiresInSeconds: READ_TTL_SECONDS, downloadFilename: filename })
  return signed.url
}
