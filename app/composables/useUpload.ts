/**
 * app/composables/useUpload.ts — upload a file through the storage service
 * (WP-L02, epic L02): presign → PUT bytes → finalize → return the final key.
 *
 * The owning service (e.g. propertyPhoto.create) receives the key, never the
 * bytes or a data: URL. Finalize verifies the real size/content type and moves
 * the object to a key that was never presigned. In production the PUT goes
 * straight to R2, so the bucket needs a CORS rule allowing PUT from the app
 * origin; locally it goes to the signed /api/_dev/uploads route.
 */
import type { StorageEntityKind } from '~~/shared/contracts/storage'

export interface UploadedAsset {
  key: string
  size: number
  contentType: string
}

export interface UploadInput {
  organizationId: string
  entity: StorageEntityKind
  entityId: string
  file: File | Blob
  /** Needed when a Blob has no type. */
  contentType?: string
}

export async function uploadAsset(input: UploadInput): Promise<UploadedAsset> {
  const contentType = input.contentType ?? input.file.type
  if (!contentType) throw new Error('Unsupported file: unknown content type')
  const presign = await $fetch<{ key: string, url: string, method: string, headers: Record<string, string> }>(
    '/api/storage/presign-upload',
    {
      method: 'POST',
      body: { organizationId: input.organizationId, entity: input.entity, entityId: input.entityId, contentType, sizeBytes: input.file.size },
    },
  )
  const put = await fetch(presign.url, { method: presign.method, headers: presign.headers, body: input.file })
  if (!put.ok) throw new Error(`Upload failed (${put.status})`)
  return await $fetch<UploadedAsset>('/api/storage/finalize-upload', {
    method: 'POST',
    body: { organizationId: input.organizationId, key: presign.key },
  })
}

export function useUpload() {
  const uploading = ref(false)
  const error = ref<string | null>(null)

  async function upload(input: UploadInput): Promise<UploadedAsset | null> {
    uploading.value = true
    error.value = null
    try {
      return await uploadAsset(input)
    } catch (err) {
      error.value = (err as { statusMessage?: string, data?: { statusMessage?: string } }).data?.statusMessage
        ?? (err as Error).message
        ?? 'Upload failed'
      return null
    } finally {
      uploading.value = false
    }
  }

  return { upload, uploading, error }
}
