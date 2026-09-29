/**
 * server/services/announcement.real.ts — RealAnnouncementService (WP-X2, ED-007).
 * Platform-wide (no tenant). `super_admin` is an organization membership role
 * (org owners hold it), so the RPC policy alone would let any tenant broadcast
 * to every tenant. Writes and the admin list therefore also require a platform
 * operator: a user whose email is in BULWARK_PLATFORM_ADMIN_EMAILS (comma list).
 * Unset means nobody can write announcements.
 */
import { and, desc, eq, gt, isNull, lte, notExists, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { announcementDismissals, platformAnnouncements } from '../db/schema/platform_announcements'
import {
  AnnouncementUpsertInputSchema,
  type Announcement,
  type AnnouncementUpsertInput,
  type IAnnouncementService,
} from '../../shared/contracts/announcement'
import { UuidSchema } from '../../shared/contracts/_shared'
import { users } from '../db/schema/users'
import { log } from '../utils/logger'
import { ForbiddenError, resolveActorUserId, type TenantResolver } from './_tenant'

export function platformOperatorEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.BULWARK_PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
}

type Row = typeof platformAnnouncements.$inferSelect
const toContract = (r: Row): Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tone: r.tone as Announcement['tone'],
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt ? r.endsAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

export class RealAnnouncementService implements IAnnouncementService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private user(): string {
    const id = resolveActorUserId(this.tenantResolver)
    if (!id) throw new Error('Authentication required')
    return id
  }

  /** Throws unless the caller is a platform operator (see file header). */
  private async operator(): Promise<string> {
    const id = this.user()
    const allowed = platformOperatorEmails()
    const [u] = allowed.size ? await getDb().select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1) : []
    if (!u || !allowed.has(u.email.toLowerCase())) throw new ForbiddenError('Forbidden: platform announcements are managed by platform operators only')
    return id
  }

  async listActive(): Promise<Announcement[]> {
    const userId = this.user()
    const now = new Date()
    const rows = await getDb().select().from(platformAnnouncements).where(and(
      isNull(platformAnnouncements.deletedAt),
      lte(platformAnnouncements.startsAt, now),
      or(isNull(platformAnnouncements.endsAt), gt(platformAnnouncements.endsAt, now)),
      notExists(getDb().select({ one: sql`1` }).from(announcementDismissals).where(and(
        eq(announcementDismissals.announcementId, platformAnnouncements.id),
        eq(announcementDismissals.userId, userId),
      ))),
    )).orderBy(desc(platformAnnouncements.startsAt))
    return rows.map(toContract)
  }

  async dismiss(id: string): Promise<void> {
    if (!UuidSchema.safeParse(id).success) throw new Error('Invalid announcement id')
    const [live] = await getDb().select({ id: platformAnnouncements.id }).from(platformAnnouncements)
      .where(and(eq(platformAnnouncements.id, id), isNull(platformAnnouncements.deletedAt))).limit(1)
    if (!live) throw new Error('Announcement not found')
    await getDb().insert(announcementDismissals).values({ announcementId: id, userId: this.user() }).onConflictDoNothing()
  }

  async list(): Promise<Announcement[]> {
    await this.operator()
    const rows = await getDb().select().from(platformAnnouncements)
      .where(isNull(platformAnnouncements.deletedAt)).orderBy(desc(platformAnnouncements.createdAt))
    return rows.map(toContract)
  }

  async upsert(input: AnnouncementUpsertInput): Promise<Announcement> {
    const actor = await this.operator()
    const parsed = AnnouncementUpsertInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid announcement: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const v = parsed.data
    const values = {
      title: v.title,
      body: v.body,
      tone: v.tone,
      ...(v.startsAt ? { startsAt: new Date(v.startsAt) } : {}),
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      updatedAt: new Date(),
    }
    const db = getDb()
    if (v.id) {
      const [row] = await db.update(platformAnnouncements).set(values)
        .where(and(eq(platformAnnouncements.id, v.id), isNull(platformAnnouncements.deletedAt))).returning()
      if (!row) throw new Error('Announcement not found')
      log('info', 'announcement.updated', { announcementId: row.id, actorUserId: actor })
      return toContract(row)
    }
    const [row] = await db.insert(platformAnnouncements).values({ ...values, createdByUserId: actor }).returning()
    log('info', 'announcement.created', { announcementId: row!.id, actorUserId: actor })
    return toContract(row!)
  }

  async remove(id: string): Promise<void> {
    const actor = await this.operator()
    const [row] = await getDb().update(platformAnnouncements).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(platformAnnouncements.id, id), isNull(platformAnnouncements.deletedAt))).returning({ id: platformAnnouncements.id })
    if (!row) throw new Error('Announcement not found')
    log('info', 'announcement.removed', { announcementId: id, actorUserId: actor })
  }
}
