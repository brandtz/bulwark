/**
 * server/services/announcement.real.ts — RealAnnouncementService (WP-X2, ED-007).
 * Platform-wide (no tenant); writes are super_admin via the RPC policy.
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
import { resolveActorUserId, type TenantResolver } from './_tenant'

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
    await getDb().insert(announcementDismissals).values({ announcementId: id, userId: this.user() }).onConflictDoNothing()
  }

  async list(): Promise<Announcement[]> {
    const rows = await getDb().select().from(platformAnnouncements)
      .where(isNull(platformAnnouncements.deletedAt)).orderBy(desc(platformAnnouncements.createdAt))
    return rows.map(toContract)
  }

  async upsert(input: AnnouncementUpsertInput): Promise<Announcement> {
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
      return toContract(row)
    }
    const [row] = await db.insert(platformAnnouncements).values({ ...values, createdByUserId: this.user() }).returning()
    return toContract(row!)
  }

  async remove(id: string): Promise<void> {
    const [row] = await getDb().update(platformAnnouncements).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(platformAnnouncements.id, id), isNull(platformAnnouncements.deletedAt))).returning({ id: platformAnnouncements.id })
    if (!row) throw new Error('Announcement not found')
  }
}
