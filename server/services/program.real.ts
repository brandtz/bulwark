/**
 * server/services/program.real.ts — RealProgramService (Wave 1A / EH-A).
 *
 * # Decisions (ADR-0008, ADR-0013)
 *   - Mirrors the property.real.ts pattern: tenant firewall via
 *     `assertSameTenant`, every mutation funnels through `withAudit`,
 *     soft-delete only (`deletedAt`), ISO-string mapping via inline
 *     row-mapper.
 *   - Builtin programs reject `softDelete` AND we strip `isActive=false`
 *     to `deactivate` semantics (i.e. callers can deactivate any
 *     program, but only custom programs can be soft-deleted).
 *   - `(organizationId, slug)` uniqueness is enforced by the DB index;
 *     we surface a friendly error message on conflict instead of
 *     leaking the Postgres detail.
 *   - Reads are NOT audited per the property.real.ts pattern.
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type {
  IProgramService,
  Program,
  ProgramAssignInput,
  ProgramCreateInput,
  ProgramEntityType,
  ProgramListInput,
  ProgramListOutput,
  ProgramMembership,
  ProgramUnassignInput,
  ProgramUpdateInput,
} from '../../shared/contracts/program'
import { getDb } from '../db/client'
import { programs } from '../db/schema/programs'
import { programMemberships } from '../db/schema/program_memberships'
import type { Program as DbProgram } from '../db/schema/programs'
import type { ProgramMembership as DbMembership } from '../db/schema/program_memberships'
import { escapeLikeContains } from '../../shared/utils/likeEscape'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbProgram): Program {
  return {
    id: r.id,
    organizationId: r.organizationId,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    description: r.description,
    color: r.color,
    icon: r.icon,
    isBuiltin: r.isBuiltin,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    inspectionTemplateId: r.inspectionTemplateId,
    standardSetId: r.standardSetId,
    complianceDocTemplateId: r.complianceDocTemplateId,
    defaultTradeSlots: r.defaultTradeSlots,
    pricingDefaults: r.pricingDefaults,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

function membershipToContract(r: DbMembership): ProgramMembership {
  return {
    id: r.id,
    organizationId: r.organizationId,
    programId: r.programId,
    entityType: r.entityType as ProgramEntityType,
    entityId: r.entityId,
    assignedAt: r.assignedAt.toISOString(),
    assignedByUserId: r.assignedByUserId,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export class RealProgramService implements IProgramService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(input: ProgramListInput): Promise<ProgramListOutput> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const conditions: SQL[] = [
      eq(programs.organizationId, input.organizationId),
      sql`${programs.deletedAt} IS NULL`,
    ]
    if (!input.includeInactive) conditions.push(eq(programs.isActive, true))
    if (input.kind) conditions.push(eq(programs.kind, input.kind))
    if (input.search) {
      // W5-3 / ADR-0037: escape LIKE wildcards in user input.
      const q = escapeLikeContains(input.search)
      const like = or(ilike(programs.name, q), ilike(programs.slug, q))
      if (like) conditions.push(like)
    }
    const where = and(...conditions)!
    const offset = (input.page - 1) * input.pageSize
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(programs)
        .where(where)
        .orderBy(asc(programs.sortOrder), asc(programs.name))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(programs).where(where),
    ])
    return {
      rows: rows.map(rowToContract),
      total: Number(totalRow?.count ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async get(id: string, organizationId: string): Promise<Program | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(programs)
      .where(
        and(
          eq(programs.id, id),
          eq(programs.organizationId, organizationId),
          sql`${programs.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? rowToContract(row) : null
  }

  async create(input: ProgramCreateInput): Promise<Program> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      try {
        const [row] = await tx
          .insert(programs)
          .values({
            organizationId: input.organizationId,
            slug: input.slug,
            name: input.name,
            kind: input.kind,
            description: input.description ?? null,
            color: input.color ?? null,
            icon: input.icon ?? null,
            isBuiltin: false,
            isActive: true,
            sortOrder: input.sortOrder ?? 0,
            defaultTradeSlots: input.defaultTradeSlots ?? null,
            pricingDefaults: input.pricingDefaults ?? null,
          })
          .returning()
        await audit.record({
          organizationId: input.organizationId,
          entityType: 'program',
          entityId: row!.id,
          action: 'create',
          actorUserId: this.actorUserId(),
          after: { name: row!.name, slug: row!.slug, kind: row!.kind },
        })
        return rowToContract(row!)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/duplicate key|unique/i.test(msg)) {
          throw new Error(`Program slug already exists: ${input.slug}`)
        }
        throw err
      }
    })
  }

  async update(input: ProgramUpdateInput): Promise<Program> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.id, input.id),
            eq(programs.organizationId, input.organizationId),
            sql`${programs.deletedAt} IS NULL`,
          ),
        )
        .limit(1)
      if (!before) throw new Error('Program not found')

      const patch: Partial<typeof programs.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.description !== undefined) patch.description = input.description
      if (input.color !== undefined) patch.color = input.color ?? null
      if (input.icon !== undefined) patch.icon = input.icon ?? null
      if (input.isActive !== undefined) patch.isActive = input.isActive
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      if (input.defaultTradeSlots !== undefined) patch.defaultTradeSlots = input.defaultTradeSlots
      if (input.pricingDefaults !== undefined) patch.pricingDefaults = input.pricingDefaults

      const [after] = await tx
        .update(programs)
        .set(patch)
        .where(and(eq(programs.id, input.id), eq(programs.organizationId, input.organizationId)))
        .returning()

      await audit.record({
        organizationId: input.organizationId,
        entityType: 'program',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { name: before.name, isActive: before.isActive, sortOrder: before.sortOrder },
        after: { name: after!.name, isActive: after!.isActive, sortOrder: after!.sortOrder },
      })
      return rowToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(programs)
        .where(and(eq(programs.id, id), eq(programs.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Program not found')
      if (before.isBuiltin) {
        throw new Error('Built-in programs cannot be deleted; deactivate them instead.')
      }
      const now = new Date()
      await tx
        .update(programs)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(programs.id, id), eq(programs.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'program',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { name: before.name, slug: before.slug },
      })
    })
  }

  async assignToEntity(input: ProgramAssignInput): Promise<ProgramMembership> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [program] = await tx
        .select()
        .from(programs)
        .where(
          and(
            eq(programs.id, input.programId),
            eq(programs.organizationId, input.organizationId),
            sql`${programs.deletedAt} IS NULL`,
          ),
        )
        .limit(1)
      if (!program) throw new Error('Program not found')

      const [existing] = await tx
        .select()
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.organizationId, input.organizationId),
            eq(programMemberships.programId, input.programId),
            eq(programMemberships.entityType, input.entityType),
            eq(programMemberships.entityId, input.entityId),
          ),
        )
        .limit(1)
      if (existing) return membershipToContract(existing)

      const [row] = await tx
        .insert(programMemberships)
        .values({
          organizationId: input.organizationId,
          programId: input.programId,
          entityType: input.entityType,
          entityId: input.entityId,
          assignedByUserId: this.actorUserId(),
          notes: input.notes ?? null,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'program_membership',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: {
          programId: input.programId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      })
      return membershipToContract(row!)
    })
  }

  async unassignFromEntity(input: ProgramUnassignInput): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [existing] = await tx
        .select()
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.organizationId, input.organizationId),
            eq(programMemberships.programId, input.programId),
            eq(programMemberships.entityType, input.entityType),
            eq(programMemberships.entityId, input.entityId),
          ),
        )
        .limit(1)
      if (!existing) return
      await tx
        .delete(programMemberships)
        .where(eq(programMemberships.id, existing.id))
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'program_membership',
        entityId: existing.id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: {
          programId: input.programId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      })
    })
  }

  async listMembershipsFor(
    input: { organizationId: string; entityType: ProgramEntityType; entityId: string },
  ): Promise<ProgramMembership[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.organizationId, input.organizationId),
          eq(programMemberships.entityType, input.entityType),
          eq(programMemberships.entityId, input.entityId),
        ),
      )
      .orderBy(desc(programMemberships.assignedAt))
    return rows.map(membershipToContract)
  }

  async listEntitiesForProgram(
    input: { organizationId: string; programId: string; entityType: ProgramEntityType },
  ): Promise<ProgramMembership[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.organizationId, input.organizationId),
          eq(programMemberships.programId, input.programId),
          eq(programMemberships.entityType, input.entityType),
        ),
      )
      .orderBy(desc(programMemberships.assignedAt))
    return rows.map(membershipToContract)
  }
}
