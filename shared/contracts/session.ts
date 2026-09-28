/**
 * shared/contracts/session.ts — the caller's sign-in sessions (WP-X2, ED-015).
 *
 * Every sign-in records a `user_sessions` row and the sealed cookie carries its
 * id. Revoking a row signs that browser out on its next request. A password
 * change revokes every other session; a password reset revokes all of them.
 * Users only ever see and revoke their own sessions.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'

export const UserSessionInfoSchema = z.object({
  id: UuidSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  /** True for the session making this request. */
  current: z.boolean(),
})
export type UserSessionInfo = z.infer<typeof UserSessionInfoSchema>

export interface ISessionService {
  /** Active (not revoked) sessions of the caller, most recently seen first. */
  listMine(): Promise<UserSessionInfo[]>
  /** Revoke one of the caller's sessions. Revoking the current one signs out on the next request. */
  revoke(id: string): Promise<void>
  /** Revoke every session of the caller except the current one. */
  revokeOthers(): Promise<{ revoked: number }>
}
