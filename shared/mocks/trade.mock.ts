/**
 * shared/mocks/trade.mock.ts — MockTradeService
 * (Wave 1B / EH-H Part A / W1-3).
 *
 * Mirrors MockProgramService. Module-level rows; pre-seeds builtins per
 * demo org. Builtins reject `softDelete`.
 */
import {
  BUILTIN_TRADES,
  type ITradeService,
  type TradeCreateInput,
  type TradeListInput,
  type TradeListOutput,
  type TradeRecord,
  type TradeUpdateInput,
} from '../contracts/trade'
import { FIXTURE_ORG_ID, FIXTURE_ORG_ID_2 } from './fixtures'
import { assertSameTenant, type TenantResolver } from './tenant'

const NOW = '2026-05-14T20:00:00.000Z'
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function seededBuiltin(orgId: string, def: typeof BUILTIN_TRADES[number]): TradeRecord {
  return {
    id: newId(),
    organizationId: orgId,
    slug: def.slug,
    name: def.name,
    description: null,
    color: def.color,
    icon: null,
    sortOrder: def.sortOrder,
    isBuiltin: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  }
}

const rows: TradeRecord[] = [
  ...BUILTIN_TRADES.map((d) => seededBuiltin(FIXTURE_ORG_ID, d)),
  ...BUILTIN_TRADES.map((d) => seededBuiltin(FIXTURE_ORG_ID_2, d)),
]

export class MockTradeService implements ITradeService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: TradeListInput): Promise<TradeListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    let scoped = rows.filter((r) => r.organizationId === input.organizationId && !r.deletedAt)
    if (!input.includeInactive) scoped = scoped.filter((r) => r.isActive)
    scoped = scoped.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    const total = scoped.length
    const start = (input.page - 1) * input.pageSize
    return {
      rows: scoped.slice(start, start + input.pageSize),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<TradeRecord | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find((x) => x.id === id && x.organizationId === organizationId)
    return r && !r.deletedAt ? r : null
  }

  async create(input: TradeCreateInput): Promise<TradeRecord> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    if (rows.find((r) => r.organizationId === input.organizationId && r.slug === input.slug && !r.deletedAt)) {
      throw new Error(`Trade slug already exists: ${input.slug}`)
    }
    const now = nowIso()
    const row: TradeRecord = {
      id: newId(),
      organizationId: input.organizationId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? rows.length,
      isBuiltin: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async update(input: TradeUpdateInput): Promise<TradeRecord> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const r = rows.find(
      (x) => x.id === input.id && x.organizationId === input.organizationId && !x.deletedAt,
    )
    if (!r) throw new Error('Trade not found')
    if (input.name !== undefined) r.name = input.name
    if (input.description !== undefined) r.description = input.description ?? null
    if (input.color !== undefined) r.color = input.color ?? null
    if (input.icon !== undefined) r.icon = input.icon ?? null
    if (input.sortOrder !== undefined) r.sortOrder = input.sortOrder
    if (input.isActive !== undefined) r.isActive = input.isActive
    r.updatedAt = nowIso()
    return r
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const r = rows.find((x) => x.id === id && x.organizationId === organizationId && !x.deletedAt)
    if (!r) throw new Error('Trade not found')
    if (r.isBuiltin) {
      throw new Error('Built-in trades cannot be deleted; deactivate them instead.')
    }
    r.deletedAt = nowIso()
    r.updatedAt = r.deletedAt
  }

  async bootstrap(input: { organizationId: string }): Promise<TradeListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    for (const def of BUILTIN_TRADES) {
      if (!rows.find((r) => r.organizationId === input.organizationId && r.slug === def.slug)) {
        rows.push(seededBuiltin(input.organizationId, def))
      }
    }
    return this.list({ organizationId: input.organizationId, page: 1, pageSize: 200 })
  }
}
