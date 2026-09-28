/**
 * server/api/account/avatar.post.ts — set the active user's avatar (E11 profile
 * completion; storage path WP-L02-S3).
 *
 * # What this file does
 *   - Accepts a finalized storage key (`{ key }`, entity `avatar`, entityId =
 *     the caller's user id) or `null` to clear, and persists it into
 *     `users.avatar_url`. Returns the signed read URL so the client can
 *     refresh its session snapshot.
 *
 * # Decisions
 *   - **Storage key, not inline base64.** The v1 64 KB data-URL path is gone
 *     (epic L02-S3). The client still resizes to 256² before uploading; the
 *     storage policy caps size/type and finalize verifies both.
 *   - **Self-only.** No `userId` body parameter; always the active session.
 *     The key must name the caller as its entity id and belong to an org the
 *     caller is an active member of (avatars are user-global, but keys are
 *     tenant-prefixed).
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '~~/server/db/client'
import { memberships, users } from '~~/server/db/schema/users'
import { assertOwnedAssetKey, isStorageKey, signAssetUrl } from '~~/server/services/storage/asset-urls'
import { parseStorageKey } from '~~/server/services/storage/keys'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = (await readBody(event).catch(() => ({}))) as { key?: unknown }
  const db = getDb()

  let nextValue: string | null = null
  if (body.key !== null && body.key !== undefined && body.key !== '') {
    if (typeof body.key !== 'string' || !isStorageKey(body.key)) {
      throw createError({ statusCode: 400, statusMessage: 'key must be a finalized storage key or null' })
    }
    const parsed = parseStorageKey(body.key)
    if (parsed.entityId !== user.userId) {
      throw createError({ statusCode: 403, statusMessage: 'Avatar key belongs to another user' })
    }
    const [member] = await db
      .select({ id: memberships.userId })
      .from(memberships)
      .where(and(
        eq(memberships.userId, user.userId),
        eq(memberships.organizationId, parsed.tenantId),
        eq(memberships.isActive, true),
      ))
      .limit(1)
    if (!member) {
      throw createError({ statusCode: 403, statusMessage: 'Avatar key belongs to another organization' })
    }
    try {
      await assertOwnedAssetKey(body.key, parsed.tenantId, 'avatar')
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: (err as Error).message })
    }
    nextValue = body.key
  }

  const [updated] = await db
    .update(users)
    .set({ avatarUrl: nextValue })
    .where(eq(users.id, user.userId))
    .returning({ avatarUrl: users.avatarUrl })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  return { avatarUrl: await signAssetUrl(updated.avatarUrl) }
})
