/**
 * shared/contracts/announcement.ts — platform announcements (WP-X2, ED-007).
 *
 * super_admin posts maintenance / platform notices; every shell shows the
 * active ones (startsAt ≤ now < endsAt) as an info or warning banner until the
 * user dismisses it. Platform-wide: not tenant-scoped.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const AnnouncementToneSchema = z.enum(['info', 'warning'])

export const AnnouncementSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  body: z.string(),
  tone: AnnouncementToneSchema,
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Announcement = z.infer<typeof AnnouncementSchema>

export const AnnouncementUpsertInputSchema = z.object({
  id: UuidSchema.optional(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(2000).default(''),
  tone: AnnouncementToneSchema.default('info'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: 'endsAt must be after startsAt', path: ['endsAt'] })
export type AnnouncementUpsertInput = z.input<typeof AnnouncementUpsertInputSchema>

export interface IAnnouncementService {
  /** Active, not dismissed by the caller. */
  listActive(): Promise<Announcement[]>
  dismiss(id: string): Promise<void>
  /** super_admin: every announcement, newest first. */
  list(): Promise<Announcement[]>
  upsert(input: AnnouncementUpsertInput): Promise<Announcement>
  remove(id: string): Promise<void>
}
