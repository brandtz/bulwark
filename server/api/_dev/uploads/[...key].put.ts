/**
 * server/api/_dev/uploads/[...key].put.ts — dev-only object store (L01-S1).
 *
 * Accepts a PUT to the HMAC-signed URL the filesystem storage driver minted,
 * mirroring an R2 presigned PUT so the upload flow is identical in dev. Returns
 * 404 in production.
 */
import { fsWriteObject, verifyFsSignature } from '~~/server/services/storage/fs-driver'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const key = getRouterParam(event, 'key')
  const q = getQuery(event)
  const exp = Number(q.exp)
  const sig = typeof q.sig === 'string' ? q.sig : ''
  if (!key || !verifyFsSignature(key, exp, sig)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid or expired signature' })
  }
  const body = await readRawBody(event, false)
  if (!body || !Buffer.isBuffer(body) || body.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }
  await fsWriteObject(key, body)
  return { ok: true, key }
})
