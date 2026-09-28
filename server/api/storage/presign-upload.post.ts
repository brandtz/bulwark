/**
 * server/api/storage/presign-upload.post.ts — mint a signed upload URL (L01-S2).
 *
 * Authenticated + tenant-firewalled (the active org is authoritative). Validates
 * the entity's MIME + size policy, mints a tenant-prefixed key, and returns a
 * short-lived presigned PUT from the active storage driver (fs in dev, R2 in prod).
 */
import { createRealServices } from '~~/server/utils/services-factory'
import { PresignUploadInputSchema } from '~~/shared/contracts/storage'
import { getStorage } from '~~/server/services/storage'
import { authorizePresignUpload, roleMayUpload } from '~~/server/services/storage/presign-policy'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const services = await createRealServices(event)
  const current = await services.auth.currentUser()
  if (!current) {
    throw createError({ statusCode: 401, statusMessage: 'No active session' })
  }

  const parsed = PresignUploadInputSchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }

  const authz = authorizePresignUpload(current.activeOrganizationId, parsed.data)
  if (!authz.ok) {
    throw createError({ statusCode: authz.status, statusMessage: authz.message })
  }
  if (!roleMayUpload(current.activeRole, parsed.data.entity)) {
    throw createError({ statusCode: 403, statusMessage: `Role ${current.activeRole} may not upload ${parsed.data.entity}` })
  }

  const signed = await getStorage().getSignedUploadUrl({
    key: authz.key,
    contentType: parsed.data.contentType,
  })
  return {
    key: authz.key,
    url: signed.url,
    method: signed.method,
    headers: signed.headers,
    expiresAt: signed.expiresAt,
  }
})
