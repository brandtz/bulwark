/**
 * shared/mocks/feature-flag.mock.ts — MockFeatureFlagService
 * (W2-4 / EH-H Part B / ADR-0021).
 *
 * # Decisions (ADR-0008)
 *   - Module-level row store. Seeded with `KNOWN_FLAGS` as global
 *     defaults (organizationId = null).
 *   - `listForOrg` is the canonical merge: KNOWN_FLAGS ∪ defaults ∪
 *     overrides; override wins.
 */
import type {
  FeatureFlag,
  FeatureFlagMerged,
  FeatureFlagSetInput,
  IFeatureFlagService,
} from '../contracts/feature-flag'
import { KNOWN_FLAGS } from '../contracts/feature-flag'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: FeatureFlag[] = []
const NOW_INIT = '2026-05-15T00:00:00.000Z'

function seedDefaults(): void {
  for (const f of KNOWN_FLAGS) {
    if (rows.some((r) => r.organizationId === null && r.slug === f.slug)) continue
    rows.push({
      id: crypto.randomUUID(),
      organizationId: null,
      slug: f.slug,
      value: f.defaultValue,
      description: f.description,
      updatedByUserId: null,
      createdAt: NOW_INIT,
      updatedAt: NOW_INIT,
      deletedAt: null,
    })
  }
}
seedDefaults()

export class MockFeatureFlagService implements IFeatureFlagService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(): Promise<{ rows: FeatureFlag[] }> {
    // No tenant assertion — global view used by super_admin only at the
    // page layer. Return rows visible across orgs for diagnostics.
    return { rows: rows.filter((r) => r.deletedAt === null) }
  }

  async get(organizationId: string | null, slug: string): Promise<FeatureFlag | null> {
    if (organizationId) assertSameTenant(this.resolver, organizationId)
    return (
      rows.find(
        (r) => r.organizationId === organizationId && r.slug === slug && r.deletedAt === null,
      ) ?? null
    )
  }

  async set(input: FeatureFlagSetInput): Promise<FeatureFlag> {
    if (input.organizationId) assertSameTenant(this.resolver, input.organizationId)
    const existing = rows.find(
      (r) =>
        r.organizationId === input.organizationId &&
        r.slug === input.slug &&
        r.deletedAt === null,
    )
    const now = new Date().toISOString()
    if (existing) {
      existing.value = input.value
      if (input.description !== undefined) existing.description = input.description ?? null
      existing.updatedByUserId = input.updatedByUserId
      existing.updatedAt = now
      return existing
    }
    const row: FeatureFlag = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      slug: input.slug,
      value: input.value,
      description: input.description ?? null,
      updatedByUserId: input.updatedByUserId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    rows.push(row)
    return row
  }

  async listForOrg(organizationId: string): Promise<{ rows: FeatureFlagMerged[] }> {
    assertSameTenant(this.resolver, organizationId)
    const out = new Map<string, FeatureFlagMerged>()

    for (const f of KNOWN_FLAGS) {
      out.set(f.slug, {
        slug: f.slug,
        value: f.defaultValue,
        description: f.description,
        hasOverride: false,
        defaultValue: f.defaultValue,
      })
    }
    for (const r of rows) {
      if (r.organizationId !== null) continue
      if (r.deletedAt !== null) continue
      const prev = out.get(r.slug)
      out.set(r.slug, {
        slug: r.slug,
        value: r.value,
        description: r.description ?? prev?.description ?? null,
        hasOverride: false,
        defaultValue: r.value,
      })
    }
    for (const r of rows) {
      if (r.organizationId !== organizationId) continue
      if (r.deletedAt !== null) continue
      const prev = out.get(r.slug)
      out.set(r.slug, {
        slug: r.slug,
        value: r.value,
        description: r.description ?? prev?.description ?? null,
        hasOverride: true,
        defaultValue: prev?.defaultValue ?? null,
      })
    }
    return { rows: Array.from(out.values()).sort((a, b) => a.slug.localeCompare(b.slug)) }
  }
}

export function __resetMockFeatureFlagsForTests(): void {
  rows.length = 0
  seedDefaults()
}
