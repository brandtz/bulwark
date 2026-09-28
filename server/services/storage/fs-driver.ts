/**
 * server/services/storage/fs-driver.ts — filesystem storage driver (L01-S1).
 *
 * Dev/test driver. Writes objects under `.data/uploads/<key>` and signs
 * short-lived URLs that point at the dev-only `/api/_dev/uploads/[...key]`
 * handlers (GET to serve, PUT to store). Signatures are HMAC-SHA256 over
 * `key:expiry` so an unsigned/expired/tampered URL is rejected — the same
 * security shape a real presigned URL has, just locally.
 *
 * NEVER selected in production (see ./index.ts env guard); the dev handlers
 * 404 in production as a second line of defense.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { copyFile, mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MIME_EXTENSION, StorageObjectKeySchema } from '../../../shared/contracts/storage'
import type {
  HeadResult,
  PutObjectInput,
  SignedDownloadInput,
  SignedDownloadResult,
  SignedUploadInput,
  SignedUploadResult,
  StorageDriver,
} from './types'

const BASE = join(process.cwd(), '.data', 'uploads')

/** Reverse of MIME_EXTENSION, for inferring a content type from a key's extension. */
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSION).map(([mime, ext]) => [ext, mime]),
)

function hmacSecret(): string {
  return (
    process.env.BULWARK_ENCRYPTION_KEY ??
    process.env.JWT_SECRET ??
    process.env.NUXT_SESSION_PASSWORD ??
    'bulwark-dev-fs-storage'
  )
}

/** HMAC-SHA256 over `key:expEpoch`. */
export function signFsPath(key: string, expEpoch: number): string {
  return createHmac('sha256', hmacSecret()).update(`${key}:${expEpoch}`).digest('hex')
}

/** Verify a filesystem signed-URL signature. Rejects expired, tampered, or malformed. */
export function verifyFsSignature(key: string, expEpoch: number, sig: string): boolean {
  if (!Number.isFinite(expEpoch) || expEpoch * 1000 < Date.now()) return false
  const expected = signFsPath(key, expEpoch)
  let a: Buffer
  let b: Buffer
  try {
    a = Buffer.from(expected, 'hex')
    b = Buffer.from(sig, 'hex')
  } catch {
    return false
  }
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

/** Guard against path traversal: only well-formed keys may touch the filesystem. */
function safeFullPath(key: string): string {
  StorageObjectKeySchema.parse(key)
  return join(BASE, key)
}

export async function fsWriteObject(key: string, body: Buffer | Uint8Array): Promise<void> {
  const full = safeFullPath(key)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, body)
}

export async function fsReadObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  const full = safeFullPath(key)
  const body = await readFile(full)
  return { body, contentType: contentTypeForKey(key) }
}

function signedRelativeUrl(
  key: string,
  expiresInSeconds: number,
): { url: string; expiresAt: string } {
  const expEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds
  const sig = signFsPath(key, expEpoch)
  return {
    url: `/api/_dev/uploads/${key}?exp=${expEpoch}&sig=${sig}`,
    expiresAt: new Date(expEpoch * 1000).toISOString(),
  }
}

export class FsDriver implements StorageDriver {
  readonly name = 'fs' as const

  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    await fsWriteObject(input.key, input.body)
    return { key: input.key }
  }

  async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    // Short upload TTL narrows the finalize-TOCTOU window (L01-S2 NEW-1).
    const { url, expiresAt } = signedRelativeUrl(input.key, input.expiresInSeconds ?? 300)
    return { url, method: 'PUT', headers: { 'content-type': input.contentType }, expiresAt }
  }

  async getSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedDownloadResult> {
    // downloadFilename is honored by R2 (response-content-disposition); the dev
    // serve handler streams inline, which is fine for local development.
    return signedRelativeUrl(input.key, input.expiresInSeconds ?? 3600)
  }

  async headObject(key: string): Promise<HeadResult> {
    try {
      const st = await stat(safeFullPath(key))
      return { exists: true, size: st.size, contentType: contentTypeForKey(key) }
    } catch {
      return { exists: false }
    }
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const target = safeFullPath(toKey)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(safeFullPath(fromKey), target)
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(safeFullPath(key))
    } catch {
      // idempotent: deleting a missing object is a no-op.
    }
  }
}
