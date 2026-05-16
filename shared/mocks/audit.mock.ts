/**
 * shared/mocks/audit.mock.ts — MockAuditService (W1-4 / EH-D).
 *
 * # Decisions (ADR-0008)
 *   - Mock audit is intentionally thin. Unit/integration tests that
 *     care about audit rows assert against the real Postgres path
 *     (integration suite). The mock here is just enough to satisfy
 *     the BulwarkServices shape so `useService('audit')` returns
 *     SOMETHING when running under `BULWARK_BACKEND=mock`.
 *   - Module-level array. Tenant firewall mirrors the rest of the
 *     mocks.
 */
import type {
  AuditFilterInput,
  AuditFilterOutput,
  AuditListInput,
  AuditLogRow,
  AuditRecordInput,
  IAuditService,
  TimelineForPropertyInput,
} from '../contracts/audit'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: AuditLogRow[] = []

export class MockAuditService implements IAuditService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async record(input: AuditRecordInput): Promise<AuditLogRow> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const now = new Date().toISOString()
    const row: AuditLogRow = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorUserId: input.actorUserId,
      metadata: input.metadata ?? {},
      before: input.before ?? null,
      after: input.after ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.unshift(row)
    return row
  }

  async list(input: AuditListInput): Promise<AuditLogRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return rows
      .filter((r) => r.organizationId === input.organizationId)
      .filter((r) => !input.entityType || r.entityType === input.entityType)
      .filter((r) => !input.entityId || r.entityId === input.entityId)
      .slice(0, input.limit)
  }

  async timelineForProperty(input: TimelineForPropertyInput): Promise<AuditLogRow[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return rows
      .filter((r) => r.organizationId === input.organizationId)
      .slice(0, input.limit)
  }

  private applyFilter(
    input: AuditFilterInput | Omit<AuditFilterInput, 'page' | 'pageSize'>,
  ): AuditLogRow[] {
    const fromMs = input.dateFrom ? Date.parse(input.dateFrom) : null
    const toMs = input.dateTo ? Date.parse(input.dateTo) : null
    const search = input.search?.toLowerCase() ?? null
    return rows
      .filter((r) => r.organizationId === input.organizationId)
      .filter((r) => (input.entityType ? r.entityType === input.entityType : true))
      .filter((r) => (input.action ? r.action === input.action : true))
      .filter((r) => (input.entityId ? r.entityId === input.entityId : true))
      .filter((r) => (input.actorUserId ? r.actorUserId === input.actorUserId : true))
      .filter((r) => {
        if (!fromMs && !toMs) return true
        const t = Date.parse(r.createdAt)
        if (fromMs && t < fromMs) return false
        if (toMs && t > toMs) return false
        return true
      })
      .filter((r) => {
        if (!search) return true
        const hay = `${r.entityType} ${r.entityId} ${r.action} ${JSON.stringify(
          r.metadata,
        )} ${JSON.stringify(r.before ?? {})} ${JSON.stringify(r.after ?? {})}`.toLowerCase()
        return hay.includes(search)
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async filter(input: AuditFilterInput): Promise<AuditFilterOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const all = this.applyFilter(input)
    const start = (input.page - 1) * input.pageSize
    return {
      rows: all.slice(start, start + input.pageSize),
      total: all.length,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async exportCsv(input: Omit<AuditFilterInput, 'page' | 'pageSize'>): Promise<string> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const all = this.applyFilter(input)
    const header = ['id', 'createdAt', 'entityType', 'entityId', 'action', 'actorUserId']
    const lines = [header.join(',')]
    for (const r of all) {
      lines.push(
        [r.id, r.createdAt, r.entityType, r.entityId, r.action, r.actorUserId ?? '']
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(','),
      )
    }
    return lines.join('\n')
  }

  /**
   * W3-5 / EH-Q (ADR-0034): record an operational error against the
   * audit log. Best-effort — swallows any internal error so callers
   * (subscribers, job runners) never fail because logging failed.
   */
  async logSystemError(input: {
    organizationId?: string
    kind: string
    message: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      const now = new Date().toISOString()
      rows.push({
        id: crypto.randomUUID(),
        organizationId: input.organizationId ?? '00000000-0000-0000-0000-000000000000',
        entityType: 'system',
        entityId: '00000000-0000-0000-0000-000000000000',
        action: 'state_change',
        actorUserId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        metadata: { kind: input.kind, message: input.message, ...(input.metadata ?? {}) },
        before: null,
        after: null,
      } as AuditLogRow)
    } catch {
      // swallow — logging must never throw.
    }
  }
}

export function __resetMockAuditForTests(): void {
  rows.length = 0
}
