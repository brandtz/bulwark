/**
 * server/services/api-key.real.ts — RealApiKeyService (E11-S12).
 *
 * # Decisions (ADR-0008)
 *   - Issue-once: `create()` generates a 32-byte random secret with the
 *     `bw_sk_` prefix, returns the RAW secret in the result, and stores
 *     ONLY the bcrypt hash in the DB. `prefix` (first ~10 chars of the
 *     raw secret) is also stored so the UI can show a recognizable
 *     identifier without leaking the secret.
 *   - Revoke is soft delete via `revokedAt`. Hard delete would lose
 *     audit history.
 *   - Verification helper `verifySecret(prefix, secret)` exists but is
 *     not part of the contract — Nuxt server middleware (E11-S4 follow-up)
 *     calls it on incoming `Authorization: Bearer bw_sk_...` headers.
 */
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type {
  ApiKey,
  ApiKeyCreateInput,
  ApiKeyCreateResult,
  IApiKeyService,
} from '../../shared/contracts/api-key'
import { getDb } from '../db/client'
import { apiKeys } from '../db/schema/api_keys'
import type { ApiKey as DbKey } from '../db/schema/api_keys'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

const SECRET_PREFIX = 'bw_sk_'
const BCRYPT_ROUNDS = 10

function generateSecret(): { raw: string; prefix: string } {
  // 32 random bytes → ~43 base64url chars → plenty of entropy.
  const raw = SECRET_PREFIX + randomBytes(24).toString('base64url')
  const prefix = raw.slice(0, 12)
  return { raw, prefix }
}

function rowToContract(r: DbKey): ApiKey {
  return {
    id: r.id,
    organizationId: r.organizationId,
    label: r.label,
    prefix: r.prefix,
    createdAt: r.createdAt.toISOString(),
    createdById: r.createdById,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  }
}

export class RealApiKeyService implements IApiKeyService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(orgId: string): Promise<ApiKey[]> {
    assertSameTenant(this.tenantResolver, orgId)
    const db = getDb()
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, orgId))
      .orderBy(desc(apiKeys.createdAt))
    return rows.map(rowToContract)
  }

  async create(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const { raw, prefix } = generateSecret()
    const secretHash = await bcrypt.hash(raw, BCRYPT_ROUNDS)
    const row = await withAudit(async ({ tx, audit }) => {
      const [r] = await tx
        .insert(apiKeys)
        .values({
          organizationId: input.organizationId,
          label: input.label,
          prefix,
          secretHash,
          createdById: input.createdById,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'api_key',
        entityId: r!.id,
        action: 'create',
        actorUserId: input.createdById,
        after: { label: input.label, prefix },
      })
      return r!
    })
    return { row: rowToContract(row), secret: raw }
  }

  async revoke(id: string, orgId: string): Promise<ApiKey> {
    assertSameTenant(this.tenantResolver, orgId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, orgId)))
        .limit(1)
      if (!before) throw new Error('API key not found')
      if (before.revokedAt) return rowToContract(before)
      const [after] = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, orgId)))
        .returning()
      await audit.record({
        organizationId: orgId,
        entityType: 'api_key',
        entityId: id,
        action: 'state_change',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        metadata: { kind: 'revoke', label: before.label },
      })
      return rowToContract(after!)
    })
  }

  /**
   * Verify a presented `Authorization: Bearer bw_sk_...` secret against
   * stored hashes for live (non-revoked) keys in the org. Returns the
   * matching key id or null. Server middleware will use this in E11-S4
   * follow-up; not part of `IApiKeyService` because callers shouldn't
   * carry raw secrets through the contract surface.
   */
  async verifySecret(orgId: string, raw: string): Promise<string | null> {
    if (!raw.startsWith(SECRET_PREFIX)) return null
    const prefix = raw.slice(0, 12)
    const db = getDb()
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.organizationId, orgId), eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)))
    for (const r of rows) {
      if (await bcrypt.compare(raw, r.secretHash)) return r.id
    }
    return null
  }
}
