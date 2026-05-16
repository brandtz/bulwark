/**
 * shared/mocks/saved-view.mock.ts — MockSavedViewService
 * (W3-5 / EH-P / ADR-0033).
 *
 * # Decisions (ADR-0008, ADR-0033)
 *   - Module-level row store. Tenant-firewalled. The list method
 *     returns the union of the user's own rows + shared (`userId IS
 *     NULL`) rows for the org.
 *   - `setDefault` clears the flag on siblings in the same (org,
 *     userId, entityType) scope. We treat the sibling scope as
 *     "rows visible to this view's owner" — for shared views, that
 *     means other shared rows of the same entityType; for personal
 *     views, that means the same user's rows.
 */
import { randomUUID } from 'node:crypto'
import type {
  ISavedViewService,
  SavedView,
  SavedViewCreateInput,
  SavedViewListInput,
  SavedViewUpdateInput,
} from '../contracts/saved-view'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: SavedView[] = []

function nowIso(): string {
  return new Date().toISOString()
}

export function __resetMockSavedViewsForTests(): void {
  rows.length = 0
}

export class MockSavedViewService implements ISavedViewService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(input: SavedViewListInput): Promise<SavedView[]> {
    assertSameTenant(this.resolver, input.organizationId)
    return rows.filter(
      (r) =>
        r.organizationId === input.organizationId &&
        r.entityType === input.entityType &&
        r.deletedAt === null &&
        (r.userId === input.userId || r.userId === null),
    )
  }

  async get(id: string, organizationId: string): Promise<SavedView | null> {
    assertSameTenant(this.resolver, organizationId)
    return (
      rows.find(
        (r) => r.id === id && r.organizationId === organizationId && r.deletedAt === null,
      ) ?? null
    )
  }

  async create(input: SavedViewCreateInput): Promise<SavedView> {
    assertSameTenant(this.resolver, input.organizationId)
    const row: SavedView = {
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      entityType: input.entityType,
      name: input.name,
      filters: input.filters ?? {},
      sortBy: input.sortBy ?? null,
      sortDir: input.sortDir ?? null,
      isDefault: input.isDefault ?? false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    }
    rows.push(row)
    if (row.isDefault) this.clearSiblingDefaults(row)
    return row
  }

  async update(input: SavedViewUpdateInput): Promise<SavedView> {
    assertSameTenant(this.resolver, input.organizationId)
    const row = rows.find(
      (r) => r.id === input.id && r.organizationId === input.organizationId && r.deletedAt === null,
    )
    if (!row) throw new Error('Saved view not found')
    if (input.name !== undefined) row.name = input.name
    if (input.filters !== undefined) row.filters = input.filters
    if (input.sortBy !== undefined) row.sortBy = input.sortBy ?? null
    if (input.sortDir !== undefined) row.sortDir = input.sortDir ?? null
    if (input.isDefault !== undefined) {
      row.isDefault = input.isDefault
      if (input.isDefault) this.clearSiblingDefaults(row)
    }
    row.updatedAt = nowIso()
    return row
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.resolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && r.deletedAt === null,
    )
    if (!row) return
    row.deletedAt = nowIso()
    row.updatedAt = row.deletedAt
  }

  async setDefault(id: string, organizationId: string): Promise<SavedView> {
    assertSameTenant(this.resolver, organizationId)
    const row = rows.find(
      (r) => r.id === id && r.organizationId === organizationId && r.deletedAt === null,
    )
    if (!row) throw new Error('Saved view not found')
    row.isDefault = true
    row.updatedAt = nowIso()
    this.clearSiblingDefaults(row)
    return row
  }

  private clearSiblingDefaults(target: SavedView): void {
    for (const r of rows) {
      if (r.id === target.id) continue
      if (r.organizationId !== target.organizationId) continue
      if (r.entityType !== target.entityType) continue
      if (r.userId !== target.userId) continue
      if (r.deletedAt !== null) continue
      if (r.isDefault) {
        r.isDefault = false
        r.updatedAt = nowIso()
      }
    }
  }
}
