/**
 * server/api/account/avatar.post.ts — set the active user's avatar (E11 profile completion).
 *
 * # What this file does
 *   - Accepts a base64 data URL (or `null` to clear) from the
 *     currently-authenticated user and persists it into
 *     `users.avatar_url`. Returns the updated value so the client
 *     can refresh its session snapshot.
 *
 * # Decisions
 *   - **Data URL storage, not R2 (v1).** The compliance-doc R2 bucket
 *     is private (signed-GET URLs expire). A public avatars bucket
 *     adds infra (custom domain, refresh worker, lifecycle policy)
 *     that's out of scope for the deploy-ready milestone. Avatars
 *     are tiny when client-side resized to 256x256 webp/jpeg
 *     (~8–20 KB), so storing them inline in the `text` column is
 *     acceptable. Migration path: a future `r2:` URL is also accepted
 *     by the same column.
 *   - **Strict allow-list on MIME + size.** Only `image/png`,
 *     `image/jpeg`, `image/webp`, capped at 64 KB of base64 payload
 *     (~48 KB binary). Anything larger gets 413 — client is expected
 *     to resize.
 *   - **Self-only.** No `userId` body parameter; always the active
 *     session. Mirrors `account/delete.post.ts`.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '~~/server/db/client'
import { users } from '~~/server/db/schema/users'

const MAX_BASE64_LEN = 64 * 1024 // ~48 KB binary after base64 decode
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = (await readBody(event).catch(() => ({}))) as {
    dataUrl?: string | null
  }

  let nextValue: string | null = null
  if (body.dataUrl !== null && body.dataUrl !== undefined && body.dataUrl !== '') {
    if (typeof body.dataUrl !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'dataUrl must be a string or null' })
    }
    const m = DATA_URL_RE.exec(body.dataUrl)
    if (!m) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid data URL; expected base64-encoded ${ALLOWED_MIME.join(', ')}`,
      })
    }
    const payload = m[2]!
    if (payload.length > MAX_BASE64_LEN) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Avatar too large; resize to 256x256 before upload',
      })
    }
    nextValue = body.dataUrl
  }

  const db = getDb()
  const [updated] = await db
    .update(users)
    .set({ avatarUrl: nextValue })
    .where(eq(users.id, user.userId))
    .returning({ avatarUrl: users.avatarUrl })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  return { avatarUrl: updated.avatarUrl }
})
