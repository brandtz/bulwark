/**
 * server/api/_dev/uploads/[...key].get.ts — dev-only object serve (L01-S1).
 *
 * Serves objects written by the filesystem storage driver, verifying the
 * HMAC-signed, time-limited URL the driver minted. Returns 404 in production
 * (the fs driver is never selected there) as a second line of defense.
 */
import { fsReadObject, verifyFsSignature } from '~~/server/services/storage/fs-driver'

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
  const obj = await fsReadObject(key).catch(() => null)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'Content-Type', obj.contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return obj.body
})
