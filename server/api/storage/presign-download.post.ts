/**
 * server/api/storage/presign-download.post.ts — mint a signed download URL (L01-S2).
 *
 * Authenticated + tenant-firewalled: the request org AND the key's tenant prefix
 * must both equal the caller's active org, so one tenant can never mint a download
 * URL for another tenant's object. Returns a short-lived presigned GET.
 */
import { createRealServices } from '~~/server/utils/services-factory'
import { PresignDownloadInputSchema } from '~~/shared/contracts/storage'
import { getStorage } from '~~/server/services/storage'
import { authorizePresignDownload } from '~~/server/services/storage/presign-policy'

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

  const parsed = PresignDownloadInputSchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }

  const authz = authorizePresignDownload(current.activeOrganizationId, parsed.data)
  if (!authz.ok) {
    throw createError({ statusCode: authz.status, statusMessage: authz.message })
  }

  const signed = await getStorage().getSignedDownloadUrl({
    key: parsed.data.key,
    downloadFilename: parsed.data.downloadFilename,
  })
  return { url: signed.url, expiresAt: signed.expiresAt }
})
