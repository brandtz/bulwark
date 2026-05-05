/**
 * shared/mocks/api-key.mock.ts — programmatic credentials (E9-S7).
 *
 * # Decisions (ADR-0008)
 *   - Issue-once contract: `create()` returns `{ row, secret }` where
 *     `secret` is the only place the raw key surfaces. Storage keeps
 *     just the prefix.
 *   - Module-level array; tenant-firewalled.
 *
 * # Decision cast down
 *   - Rejected: persisting a hash for verification. The mock layer
 *     never authenticates incoming requests; the secret is purely
 *     ceremonial until E11 wires the real verifier.
 */
import type {
  ApiKey,
  ApiKeyCreateInput,
  ApiKeyCreateResult,
  IApiKeyService,
} from '../contracts/api-key'
import { assertSameTenant, type TenantResolver } from './tenant'

const rows: ApiKey[] = []

let _idCounter = 0
function nextId(): string {
  _idCounter += 1
  return `apikey-${Date.now()}-${_idCounter}`
}

function generateSecret(): string {
  // 32 random hex chars; deterministic enough for demo, opaque to consumers.
  const arr = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
  return `bw_sk_${hex}`
}

export class MockApiKeyService implements IApiKeyService {
  constructor(private readonly resolver?: TenantResolver) {}

  async list(orgId: string): Promise<ApiKey[]> {
    assertSameTenant(this.resolver, orgId)
    return rows
      .filter((r) => r.organizationId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async create(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult> {
    assertSameTenant(this.resolver, input.organizationId)
    const secret = generateSecret()
    const prefix = `${secret.slice(0, 10)}…`
    const now = new Date().toISOString()
    const row: ApiKey = {
      id: nextId(),
      organizationId: input.organizationId,
      label: input.label,
      prefix,
      createdAt: now,
      createdById: input.createdById,
      revokedAt: null,
    }
    rows.push(row)
    return { row, secret }
  }

  async revoke(id: string, orgId: string): Promise<ApiKey> {
    assertSameTenant(this.resolver, orgId)
    const row = rows.find((r) => r.id === id && r.organizationId === orgId)
    if (!row) throw new Error('API key not found')
    if (!row.revokedAt) row.revokedAt = new Date().toISOString()
    return row
  }
}

export function __resetMockApiKeysForTests(): void {
  rows.length = 0
  _idCounter = 0
}
