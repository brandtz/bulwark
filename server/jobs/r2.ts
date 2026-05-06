/**
 * server/jobs/r2.ts — Cloudflare R2 client + signed-URL helper (E11-S10).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - R2 is S3-compatible, so we use `@aws-sdk/client-s3` with the
 *     account-scoped endpoint `https://<account>.r2.cloudflarestorage.com`.
 *   - Region is `auto` for R2 (Cloudflare ignores it but the SDK requires
 *     a non-empty value).
 *   - Signed URLs default to 7 days (max R2 supports for v4 signing).
 *   - All env-driven: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *     R2_BUCKET, R2_ENDPOINT (optional override).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _client: S3Client | null = null

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export function getR2Client(): S3Client {
  if (_client) return _client
  const accountId = requireEnv('R2_ACCOUNT_ID')
  const endpoint =
    process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })
  return _client
}

export function getR2Bucket(): string {
  return requireEnv('R2_BUCKET')
}

export interface UploadInput {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}

export async function uploadToR2(input: UploadInput): Promise<{ key: string }> {
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

export async function signR2GetUrl(key: string, expiresInSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const client = getR2Client()
  return getSignedUrl(client, new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  })
}
