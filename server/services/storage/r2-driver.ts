/**
 * server/services/storage/r2-driver.ts — Cloudflare R2 storage driver (L01-S1).
 *
 * Production driver. Wraps the existing S3 client (`server/jobs/r2.ts`) to mint
 * presigned PUT (upload) and GET (download) URLs and to head/delete objects.
 * The constructor validates required env up-front so a misconfigured production
 * deploy fails closed with a clear message instead of silently degrading.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client, getR2Bucket } from '../../jobs/r2'
import type {
  HeadResult,
  PutObjectInput,
  SignedDownloadInput,
  SignedDownloadResult,
  SignedUploadInput,
  SignedUploadResult,
  StorageDriver,
} from './types'

const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']

function requireR2Env(): void {
  for (const name of REQUIRED_ENV) {
    if (!process.env[name]) {
      throw new Error(
        `Storage driver 'r2' requires env ${name}. ` +
          `Set BULWARK_STORAGE_DRIVER=fs for local dev, or provide R2 credentials.`,
      )
    }
  }
}

export class R2Driver implements StorageDriver {
  readonly name = 'r2' as const

  constructor() {
    // Fail closed at construction so a prod deploy missing creds errors clearly.
    requireR2Env()
  }

  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    const client = getR2Client()
    await client.send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    )
    return { key: input.key }
  }

  async getSignedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    const client = getR2Client()
    const expiresIn = input.expiresInSeconds ?? 900
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn },
    )
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }
  }

  async getSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedDownloadResult> {
    const client = getR2Client()
    const expiresIn = input.expiresInSeconds ?? 3600
    const command = new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: input.key,
      ...(input.downloadFilename
        ? { ResponseContentDisposition: `attachment; filename="${input.downloadFilename}"` }
        : {}),
    })
    const url = await getSignedUrl(client, command, { expiresIn })
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }
  }

  async headObject(key: string): Promise<HeadResult> {
    const client = getR2Client()
    try {
      const r = await client.send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }))
      return { exists: true, size: r.ContentLength, contentType: r.ContentType }
    } catch {
      return { exists: false }
    }
  }

  async deleteObject(key: string): Promise<void> {
    const client = getR2Client()
    await client.send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }))
  }
}
