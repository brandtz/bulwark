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
  /**
   * Server-side copy (WP-L02). Finalize copies a verified upload to a key that was
   * never presigned, so the persisted object cannot be overwritten through a still-
   * valid upload URL (gap 3.1.8 finalize TOCTOU).
   */
  copyObject(fromKey: string, toKey: string): Promise<void>
  /** Read an object's bytes (WP-X3 scanning); null when it does not exist. */
  getObject(key: string): Promise<Buffer | null>
  /**
   * Move an object out of the servable key space into `quarantine/<key>` (WP-X3,
   * ED-00E). The quarantined copy is never signed or served (it is not a valid
   * storage key) but stays available for investigation. Returns its location.
   */
  quarantineObject(key: string): Promise<string>
}
