/**
 * server/api/storage/finalize-upload.post.ts — verify a completed upload (L01-S2).
 *
 * A SigV4 presigned PUT cannot bind body size, so the `sizeBytes` declared at
 * presign time is advisory. After the client PUTs, it calls finalize: the server
 * HEADs the stored object and enforces the entity's REAL size + content-type rule,
 * deleting the object on violation. Owning services persist the key only after a
 * successful finalize. (L01-S2 skeptic P0-1.)
 */
import { createRealServices } from '~~/server/utils/services-factory'
import { FinalizeUploadInputSchema, validateUpload } from '~~/shared/contracts/storage'
import { getStorage } from '~~/server/services/storage'
import { authorizeFinalize } from '~~/server/services/storage/presign-policy'

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

  const parsed = FinalizeUploadInputSchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }

  const authz = authorizeFinalize(current.activeOrganizationId, parsed.data)
  if (!authz.ok) {
    throw createError({ statusCode: authz.status, statusMessage: authz.message })
  }

  const storage = getStorage()
  const head = await storage.headObject(parsed.data.key)
  if (!head.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Uploaded object not found' })
  }

  // Enforce the entity rule against the REAL stored object. Size is authoritative
  // on both drivers; content-type is byte-accurate on R2 (bound at PUT) and
  // extension-derived on fs (dev) — safe because no allow-list entry is inline-executable.
  const size = head.size ?? 0
  const contentType = head.contentType ?? 'application/octet-stream'
  const verdict = validateUpload(authz.entity, contentType, size)
  if (!verdict.ok) {
    // Reject + remove the offending object so it can never be referenced.
    await storage.deleteObject(parsed.data.key)
    throw createError({ statusCode: 400, statusMessage: `Rejected: ${verdict.reason}` })
  }

  return { key: parsed.data.key, size, contentType }
})
