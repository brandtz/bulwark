/**
 * server/api/account/export.get.ts — DSR data export endpoint
 * (W5-4 / Privacy + Compliance / ADR-0038).
 *
 * # What this file does
 *   - Returns the JSON personal-data export for the currently
 *     authenticated user. The response is sent as an attachment
 *     so browsers prompt a download instead of rendering the JSON.
 *
 * # Decisions (ADR-0008, ADR-0038)
 *   - **Per-user, not per-org.** The active session's `userId` is the
 *     only authorisation gate. There is no `organizationId` query —
 *     the export spans every org the user belongs to.
 *   - **No payload streaming.** Phase 1 returns the full JSON
 *     synchronously; ceiling is `ACCOUNT_EXPORT_AUDIT_CAP` rows. A
 *     truncated payload sets `auditTruncated: true`.
 *   - **Filename includes user id + date.** `bulwark-export-<id>-<yyyy-mm-dd>.json`.
 *     Matches the privacy-policy disclosure ("we deliver your data
 *     as a JSON file you can download").
 */
import { createRealServices } from '~~/server/utils/services-factory'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { userId?: string } | undefined
  if (!user?.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const services = await createRealServices(event)
  const exportData = await services.account.exportPersonalData(user.userId)

  const date = new Date().toISOString().slice(0, 10)
  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="bulwark-export-${user.userId}-${date}.json"`,
  )
  // No-cache: this is freshly-generated and contains PII; don't let a
  // shared proxy keep a copy.
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')

  return exportData
})
