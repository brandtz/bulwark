/**
 * server/services/permit.real.ts — RealPermitService (WP-X2, ED-039).
 * Contract + decisions: shared/contracts/permit.ts.
 */
import { and, asc, eq, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import { getDb } from '../db/client'
import { jurisdictions, permitJobs, permits } from '../db/schema/permits'
import { properties } from '../db/schema/properties'
import { workOrders } from '../db/schema/work_orders'
import {
  PermitCreateInputSchema,
  PermitListInputSchema,
  PermitUpdateInputSchema,
  validatePermitState,
  type IPermitService,
  type Jurisdiction,
  type Permit,
  type PermitCreateInput,
  type PermitListInput,
  type PermitStatus,
  type PermitUpdateInput,
} from '../../shared/contracts/permit'
import { assertSameTenant, resolveActorUserId, type TenantResolver } from './_tenant'
import { withAudit, type AuditCtx } from './_tx'

type PermitRow = typeof permits.$inferSelect
type Tx = AuditCtx['tx']
const iso = (d: Date | null) => (d ? d.toISOString() : null)
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null)

function toContract(r: PermitRow, workOrderIds: string[]): Permit {
  return {
    id: r.id,
    organizationId: r.organizationId,
    propertyId: r.propertyId,
    jurisdictionId: r.jurisdictionId,
    jurisdictionOther: r.jurisdictionOther,
    permitNumber: r.permitNumber,
    kind: r.kind,
    status: r.status as PermitStatus,
    appliedAt: iso(r.appliedAt),
    issuedAt: iso(r.issuedAt),
    expiresAt: iso(r.expiresAt),
    notes: r.notes,
    workOrderIds,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: iso(r.deletedAt),
  }
}

function jurisdictionToContract(r: typeof jurisdictions.$inferSelect): Jurisdiction {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    code: r.code,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: iso(r.deletedAt),
  }
}

function parse<T>(schema: { safeParse(v: unknown): { success: true, data: T } | { success: false, error: { issues: Array<{ path: Array<string | number>, message: string }> } } }, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new Error(`Invalid permit input: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  return r.data
}

export class RealPermitService implements IPermitService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actor() {
    return resolveActorUserId(this.tenantResolver)
  }

  private async jobsFor(ids: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>()
    if (!ids.length) return out
    const rows = await getDb().select().from(permitJobs).where(inArray(permitJobs.permitId, ids))
    for (const r of rows) out.set(r.permitId, [...(out.get(r.permitId) ?? []), r.workOrderId])
    return out
  }

  /** Work orders must belong to the org and to the permit's property. */
  private async assertWorkOrders(tx: Tx, organizationId: string, propertyId: string, ids: string[]) {
    if (!ids.length) return
    const rows = await tx.select({ id: workOrders.id, propertyId: workOrders.propertyId }).from(workOrders)
      .where(and(inArray(workOrders.id, ids), eq(workOrders.organizationId, organizationId), isNull(workOrders.deletedAt)))
    if (rows.length !== new Set(ids).size) throw new Error('Invalid permit: work order not found')
    if (rows.some((r) => r.propertyId !== propertyId)) throw new Error('Invalid permit: work order is on a different property')
  }

  private async assertJurisdiction(organizationId: string, id: string | null | undefined) {
    if (!id) return
    const [j] = await getDb().select({ id: jurisdictions.id }).from(jurisdictions)
      .where(and(eq(jurisdictions.id, id), eq(jurisdictions.organizationId, organizationId), isNull(jurisdictions.deletedAt))).limit(1)
    if (!j) throw new Error('Invalid permit: jurisdiction not found')
  }

  async list(input: PermitListInput): Promise<Permit[]> {
    const v = parse(PermitListInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const conds: SQL[] = [eq(permits.organizationId, v.organizationId), isNull(permits.deletedAt)]
    if (v.propertyId) conds.push(eq(permits.propertyId, v.propertyId))
    if (v.status) conds.push(eq(permits.status, v.status))
    if (v.expiringBefore) conds.push(lte(permits.expiresAt, new Date(v.expiringBefore)))
    let rows = await getDb().select().from(permits).where(and(...conds)).orderBy(asc(permits.createdAt))
    const jobs = await this.jobsFor(rows.map((r) => r.id))
    if (v.workOrderId) rows = rows.filter((r) => (jobs.get(r.id) ?? []).includes(v.workOrderId!))
    return rows.map((r) => toContract(r, jobs.get(r.id) ?? []))
  }

  async get(id: string, organizationId: string): Promise<Permit | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const [row] = await getDb().select().from(permits)
      .where(and(eq(permits.id, id), eq(permits.organizationId, organizationId), isNull(permits.deletedAt))).limit(1)
    if (!row) return null
    return toContract(row, (await this.jobsFor([id])).get(id) ?? [])
  }

  async create(input: PermitCreateInput): Promise<Permit> {
    const v = parse(PermitCreateInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const err = validatePermitState({
      status: v.status ?? 'draft',
      issuedAt: v.issuedAt ?? null,
      jurisdictionId: v.jurisdictionId ?? null,
      jurisdictionOther: v.jurisdictionOther ?? null,
    })
    if (err) throw new Error(err)
    await this.assertJurisdiction(v.organizationId, v.jurisdictionId)
    const [prop] = await getDb().select({ id: properties.id }).from(properties)
      .where(and(eq(properties.id, v.propertyId), eq(properties.organizationId, v.organizationId))).limit(1)
    if (!prop) throw new Error('Invalid permit: property not found')
    const id = await withAudit(async ({ tx, audit }) => {
      await this.assertWorkOrders(tx, v.organizationId, v.propertyId, v.workOrderIds)
      const [row] = await tx.insert(permits).values({
        organizationId: v.organizationId,
        propertyId: v.propertyId,
        jurisdictionId: v.jurisdictionId ?? null,
        jurisdictionOther: v.jurisdictionOther ?? null,
        permitNumber: v.permitNumber ?? null,
        kind: v.kind ?? 'building',
        status: v.status ?? 'draft',
        appliedAt: toDate(v.appliedAt),
        issuedAt: toDate(v.issuedAt),
        expiresAt: toDate(v.expiresAt),
        notes: v.notes ?? null,
      }).returning({ id: permits.id })
      if (v.workOrderIds.length) {
        await tx.insert(permitJobs).values([...new Set(v.workOrderIds)].map((workOrderId) => ({ organizationId: v.organizationId, permitId: row!.id, workOrderId })))
      }
      await audit.record({ organizationId: v.organizationId, entityType: 'permit', entityId: row!.id, action: 'create', actorUserId: this.actor(), after: { propertyId: v.propertyId, status: v.status ?? 'draft' } })
      return row!.id
    })
    return (await this.get(id, v.organizationId))!
  }

  async update(input: PermitUpdateInput): Promise<Permit> {
    const v = parse(PermitUpdateInputSchema, input)
    assertSameTenant(this.tenantResolver, v.organizationId)
    const before = await this.get(v.id, v.organizationId)
    if (!before) throw new Error('Permit not found')
    const next = {
      status: v.status ?? before.status,
      issuedAt: v.issuedAt !== undefined ? v.issuedAt : before.issuedAt,
      jurisdictionId: v.jurisdictionId !== undefined ? v.jurisdictionId : before.jurisdictionId,
      jurisdictionOther: v.jurisdictionOther !== undefined ? v.jurisdictionOther : before.jurisdictionOther,
    }
    const err = validatePermitState(next)
    if (err) throw new Error(err)
    if (v.jurisdictionId) await this.assertJurisdiction(v.organizationId, v.jurisdictionId)
    const patch: Partial<typeof permits.$inferInsert> = { updatedAt: new Date() }
    if (v.jurisdictionId !== undefined) patch.jurisdictionId = v.jurisdictionId
    if (v.jurisdictionOther !== undefined) patch.jurisdictionOther = v.jurisdictionOther
    if (v.permitNumber !== undefined) patch.permitNumber = v.permitNumber
    if (v.kind !== undefined) patch.kind = v.kind
    if (v.status !== undefined) patch.status = v.status
    if (v.appliedAt !== undefined) patch.appliedAt = toDate(v.appliedAt)
    if (v.issuedAt !== undefined) patch.issuedAt = toDate(v.issuedAt)
    if (v.expiresAt !== undefined) patch.expiresAt = toDate(v.expiresAt)
    if (v.notes !== undefined) patch.notes = v.notes
    await withAudit(async ({ tx, audit }) => {
      await tx.update(permits).set(patch).where(and(eq(permits.id, v.id), eq(permits.organizationId, v.organizationId)))
      await audit.record({
        organizationId: v.organizationId, entityType: 'permit', entityId: v.id,
        action: v.status && v.status !== before.status ? 'state_change' : 'update',
        actorUserId: this.actor(),
        before: { status: before.status }, after: { status: next.status },
      })
    })
    return (await this.get(v.id, v.organizationId))!
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [row] = await tx.update(permits).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(permits.id, id), eq(permits.organizationId, organizationId), isNull(permits.deletedAt))).returning({ id: permits.id })
      if (!row) throw new Error('Permit not found')
      await audit.record({ organizationId, entityType: 'permit', entityId: id, action: 'delete', actorUserId: this.actor() })
    })
  }

  async linkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const permit = await this.get(input.permitId, input.organizationId)
    if (!permit) throw new Error('Permit not found')
    await withAudit(async ({ tx, audit }) => {
      await this.assertWorkOrders(tx, input.organizationId, permit.propertyId, [input.workOrderId])
      await tx.insert(permitJobs).values({ organizationId: input.organizationId, permitId: input.permitId, workOrderId: input.workOrderId }).onConflictDoNothing()
      await audit.record({ organizationId: input.organizationId, entityType: 'permit', entityId: input.permitId, action: 'update', actorUserId: this.actor(), metadata: { kind: 'link_work_order', workOrderId: input.workOrderId } })
    })
    return (await this.get(input.permitId, input.organizationId))!
  }

  async unlinkWorkOrder(input: { organizationId: string, permitId: string, workOrderId: string }): Promise<Permit> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    if (!(await this.get(input.permitId, input.organizationId))) throw new Error('Permit not found')
    await withAudit(async ({ tx, audit }) => {
      await tx.delete(permitJobs).where(and(eq(permitJobs.permitId, input.permitId), eq(permitJobs.workOrderId, input.workOrderId), eq(permitJobs.organizationId, input.organizationId)))
      await audit.record({ organizationId: input.organizationId, entityType: 'permit', entityId: input.permitId, action: 'update', actorUserId: this.actor(), metadata: { kind: 'unlink_work_order', workOrderId: input.workOrderId } })
    })
    return (await this.get(input.permitId, input.organizationId))!
  }

  async listJurisdictions(organizationId: string): Promise<Jurisdiction[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const rows = await getDb().select().from(jurisdictions)
      .where(and(eq(jurisdictions.organizationId, organizationId), isNull(jurisdictions.deletedAt))).orderBy(asc(jurisdictions.name))
    return rows.map(jurisdictionToContract)
  }

  async upsertJurisdiction(input: { organizationId: string, id?: string, name: string, code?: string | null }): Promise<Jurisdiction> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const name = input.name?.trim()
    if (!name || name.length > 160) throw new Error('Invalid jurisdiction: name is required (max 160)')
    const db = getDb()
    const [clash] = await db.select({ id: jurisdictions.id }).from(jurisdictions)
      .where(and(eq(jurisdictions.organizationId, input.organizationId), eq(jurisdictions.name, name), isNull(jurisdictions.deletedAt))).limit(1)
    if (clash && clash.id !== input.id) throw new Error(`Invalid jurisdiction: "${name}" already exists`)
    if (input.id) {
      const [row] = await db.update(jurisdictions).set({ name, code: input.code ?? null, updatedAt: new Date() })
        .where(and(eq(jurisdictions.id, input.id), eq(jurisdictions.organizationId, input.organizationId), isNull(jurisdictions.deletedAt))).returning()
      if (!row) throw new Error('Jurisdiction not found')
      return jurisdictionToContract(row)
    }
    const [row] = await db.insert(jurisdictions).values({ organizationId: input.organizationId, name, code: input.code ?? null }).returning()
    return jurisdictionToContract(row!)
  }

  async deleteJurisdiction(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [inUse] = await db.select({ id: permits.id }).from(permits)
      .where(and(eq(permits.jurisdictionId, id), eq(permits.organizationId, organizationId), isNull(permits.deletedAt))).limit(1)
    if (inUse) throw new Error('Invalid delete: permits still reference this jurisdiction')
    const [row] = await db.update(jurisdictions).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(jurisdictions.id, id), eq(jurisdictions.organizationId, organizationId), isNull(jurisdictions.deletedAt))).returning({ id: jurisdictions.id })
    if (!row) throw new Error('Jurisdiction not found')
  }
}
