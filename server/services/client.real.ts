/**
 * server/services/client.real.ts — RealClientService (E11-S5).
 *
 * # Decisions (ADR-0008)
 *   - Same firewall + audit pattern as RealPropertyService.
 *   - Search hits `full_name`, `email`, and `phone` via ILIKE. Phone
 *     match is loose (substring, no normalization) — matching the mock.
 */
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type {
  IClientService,
  Client,
  ClientCreateInput,
  ClientListInput,
  ClientListOutput,
} from '../../shared/contracts/client'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { getDb } from '../db/client'
import { clients } from '../db/schema/clients'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbClientToContract } from './_row-mappers'

export class RealClientService implements IClientService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async list(input: ClientListInput): Promise<ClientListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()

    const conditions: SQL[] = [
      eq(clients.organizationId, input.organizationId),
      sql`${clients.deletedAt} IS NULL`,
    ]
    if (input.search) {
      // W5-3 / ADR-0037: escape LIKE wildcards so user input can't
      // widen the match to every row.
      const q = escapeLikeContains(input.search)
      const like = or(ilike(clients.fullName, q), ilike(clients.email, q), ilike(clients.phone, q))
      if (like) conditions.push(like)
    }
    const where = and(...conditions)!

    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(clients)
        .where(where)
        .orderBy(desc(clients.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(clients).where(where),
    ])
    return {
      rows: rows.map(dbClientToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Client | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, id),
          eq(clients.organizationId, organizationId),
          sql`${clients.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? dbClientToContract(row) : null
  }

  async create(input: ClientCreateInput): Promise<Client> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx
        .insert(clients)
        .values({
          organizationId: input.organizationId,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone,
          preferredContact: input.preferredContact ?? null,
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'client',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.tenantResolver?.()?.userId ?? null,
        after: { fullName: row!.fullName },
      })
      return dbClientToContract(row!)
    })
  }
}
