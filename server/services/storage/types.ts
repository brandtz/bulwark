/**
 * server/services/storage/types.ts — storage driver interface (L01-S1 / ADR-0001).
 *
 * A `StorageDriver` is the seam between Bulwark and an object store. Two drivers
 * implement it: `FsDriver` (dev/test, writes under .data/uploads) and `R2Driver`
 * (production, Cloudflare R2 via the S3 client). Callers depend only on this
 * interface via `getStorage()`.
 */

export interface PutObjectInput {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}

export interface SignedUploadInput {
  key: string
  contentType: string
  expiresInSeconds?: number
}

export interface SignedUploadResult {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: string
}

export interface SignedDownloadInput {
  key: string
  expiresInSeconds?: number
  downloadFilename?: string
}

export interface SignedDownloadResult {
  url: string
  expiresAt: string
}

export interface HeadResult {
  exists: boolean
  size?: number
  contentType?: string
}

export interface StorageDriver {
  readonly name: 'r2' | 'fs'
  putObject(input: PutObjectInput): Promise<{ key: string }>
  getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult>
  getSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedDownloadResult>
  headObject(key: string): Promise<HeadResult>
  deleteObject(key: string): Promise<void>
}
