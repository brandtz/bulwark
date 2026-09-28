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
import { FinalizeUploadInputSchema, MIME_EXTENSION, validateUpload } from '~~/shared/contracts/storage'
import { getStorage } from '~~/server/services/storage'
import { authorizeFinalize, roleMayUpload } from '~~/server/services/storage/presign-policy'
import { buildStorageKey, parseStorageKey } from '~~/server/services/storage/keys'

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

  if (!roleMayUpload(current.activeRole, authz.entity)) {
    throw createError({ statusCode: 403, statusMessage: `Role ${current.activeRole} may not upload ${authz.entity}` })
  }

  const storage = getStorage()
  const staged = await storage.headObject(parsed.data.key)
  if (!staged.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Uploaded object not found' })
  }

  // Copy-on-finalize (WP-L02, gap 3.1.8): the staged key's presigned PUT URL stays valid
  // for its TTL, so a key persisted as-is could be overwritten after this check. Copy to a
  // fresh key that was never presigned, drop the staging copy, and verify the COPY — so a
  // PUT racing the copy can only change what gets verified, never what gets persisted.
  const stagedType = staged.contentType ?? 'application/octet-stream'
  if (!MIME_EXTENSION[stagedType]) {
    await storage.deleteObject(parsed.data.key)
    throw createError({ statusCode: 400, statusMessage: `Rejected: content type ${stagedType} is not allowed` })
  }
  const stagedKey = parseStorageKey(parsed.data.key)
  const finalKey = buildStorageKey({
    tenantId: stagedKey.tenantId,
    entity: authz.entity,
    entityId: stagedKey.entityId,
    contentType: stagedType,
  })
  await storage.copyObject(parsed.data.key, finalKey)
  await storage.deleteObject(parsed.data.key)

  // Enforce the entity rule against the REAL stored object. Size is authoritative
  // on both drivers; content-type is byte-accurate on R2 (bound at PUT) and
  // extension-derived on fs (dev) — safe because no allow-list entry is inline-executable.
  const head = await storage.headObject(finalKey)
  const size = head.size ?? 0
  const contentType = head.contentType ?? 'application/octet-stream'
  const verdict = validateUpload(authz.entity, contentType, size)
  if (!head.exists || !verdict.ok || !finalKey.endsWith('.' + (MIME_EXTENSION[contentType] ?? '?'))) {
    // Reject + remove the offending object so it can never be referenced.
    await storage.deleteObject(finalKey)
    throw createError({ statusCode: 400, statusMessage: `Rejected: ${verdict.ok ? 'content changed during upload' : verdict.reason}` })
  }
  return { key: finalKey, size, contentType }
})
