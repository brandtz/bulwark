/**
 * shared/mocks/session.mock.ts — MockSessionService (WP-X2, ED-015).
 * One synthetic "this browser" session per user; revoking only marks rows.
 */
import type { ISessionService, UserSessionInfo } from '../contracts/session'
import type { TenantResolver } from './tenant'

export class MockSessionService implements ISessionService {
  private rows = new Map<string, Array<UserSessionInfo & { revoked?: boolean }>>()

  constructor(private readonly tenantResolver?: TenantResolver) {}

  private mine() {
    const userId = this.tenantResolver?.()?.userId
    if (!userId) throw new Error('Authentication required')
    let list = this.rows.get(userId)
    if (!list) {
      const now = new Date().toISOString()
      list = [{ id: globalThis.crypto.randomUUID(), userAgent: globalThis.navigator?.userAgent ?? null, ipAddress: null, createdAt: now, lastSeenAt: now, current: true }]
      this.rows.set(userId, list)
    }
    return list
  }

  async listMine(): Promise<UserSessionInfo[]> {
    return this.mine().filter((r) => !r.revoked).map(({ revoked: _r, ...r }) => r)
  }

  async revoke(id: string): Promise<void> {
    const row = this.mine().find((r) => r.id === id && !r.revoked)
    if (!row) throw new Error('Session not found')
    row.revoked = true
  }

  async revokeOthers(): Promise<{ revoked: number }> {
    let revoked = 0
    for (const r of this.mine()) {
      if (!r.current && !r.revoked) { r.revoked = true; revoked++ }
    }
    return { revoked }
  }
}
