/**
 * shared/mocks/announcement.mock.ts — MockAnnouncementService (WP-X2, ED-007).
 */
import { AnnouncementUpsertInputSchema, type Announcement, type AnnouncementUpsertInput, type IAnnouncementService } from '../contracts/announcement'
import type { TenantResolver } from './tenant'

export class MockAnnouncementService implements IAnnouncementService {
  private rows: Array<Announcement & { deleted?: boolean }> = []
  private dismissed = new Set<string>()

  constructor(private readonly tenantResolver?: TenantResolver) {}

  private key(id: string) {
    return `${this.tenantResolver?.()?.userId ?? 'anon'}:${id}`
  }

  async listActive(): Promise<Announcement[]> {
    const now = new Date().toISOString()
    return this.rows.filter((r) => !r.deleted && r.startsAt <= now && (!r.endsAt || r.endsAt > now) && !this.dismissed.has(this.key(r.id)))
  }

  async dismiss(id: string): Promise<void> {
    this.dismissed.add(this.key(id))
  }

  async list(): Promise<Announcement[]> {
    return this.rows.filter((r) => !r.deleted)
  }

  async upsert(input: AnnouncementUpsertInput): Promise<Announcement> {
    const parsed = AnnouncementUpsertInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid announcement: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const v = parsed.data
    const now = new Date().toISOString()
    if (v.id) {
      const row = this.rows.find((r) => r.id === v.id && !r.deleted)
      if (!row) throw new Error('Announcement not found')
      Object.assign(row, { title: v.title, body: v.body, tone: v.tone, startsAt: v.startsAt ?? row.startsAt, endsAt: v.endsAt ?? null, updatedAt: now })
      return row
    }
    const row = { id: globalThis.crypto.randomUUID(), title: v.title, body: v.body, tone: v.tone, startsAt: v.startsAt ?? now, endsAt: v.endsAt ?? null, createdAt: now, updatedAt: now }
    this.rows.push(row)
    return row
  }

  async remove(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id && !r.deleted)
    if (!row) throw new Error('Announcement not found')
    row.deleted = true
  }
}
