/**
 * server/services/signature.real.ts — RealSignatureService (WP-X2, ED-00D).
 * Append-only e-signatures; decisions in shared/contracts/signature.ts.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { changeOrders } from '../db/schema/change_orders'
import { deliverables } from '../db/schema/deliverables'
import { homeownerUsers } from '../db/schema/homeowner_users'
import { inspections } from '../db/schema/inspections'
import { invoices } from '../db/schema/invoices'
import { quotes } from '../db/schema/quotes'
import { signatures, type SignatureRow } from '../db/schema/signatures'
import { memberships } from '../db/schema/users'
import { workOrders } from '../db/schema/work_orders'
import {
  SignatureCreateInputSchema,
  type ISignatureService,
  type Signature,
  type SignatureCreateInput,
  type SignedEntityType,
} from '../../shared/contracts/signature'
import { assertSameTenant, ForbiddenError, resolveActorUserId, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { assertOwnedAssetKey } from './storage/asset-urls'

export interface RequestMeta {
  ipAddress: string | null
  userAgent: string | null
}

const STAFF = new Set(['super_admin', 'org_admin', 'org_manager', 'field'])
const STAFF_READ = new Set([...STAFF, 'viewer'])
const HOMEOWNER_SIGNABLE = new Set<SignedEntityType>(['quote', 'change_order'])

function toContract(r: SignatureRow): Signature {
  return {
    id: r.id,
    organizationId: r.organizationId,
    entityType: r.entityType as SignedEntityType,
    entityId: r.entityId,
    signerName: r.signerName,
    signerEmail: r.signerEmail,
    signerUserId: r.signerUserId,
    method: r.method as Signature['method'],
    imageKey: r.imageKey,
    consent: true,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    documentHash: r.documentHash,
    signedAt: r.signedAt.toISOString(),
  }
}

/** The property an entity belongs to, or null when it does not exist in the org. */
async function entityPropertyId(entityType: SignedEntityType, entityId: string, organizationId: string): Promise<string | null> {
  const db = getDb()
  if (entityType === 'quote') {
    const [r] = await db.select({ p: quotes.propertyId }).from(quotes).where(and(eq(quotes.id, entityId), eq(quotes.organizationId, organizationId), isNull(quotes.deletedAt))).limit(1)
    return r?.p ?? null
  }
  if (entityType === 'inspection') {
    const [r] = await db.select({ p: inspections.propertyId }).from(inspections).where(and(eq(inspections.id, entityId), eq(inspections.organizationId, organizationId), isNull(inspections.deletedAt))).limit(1)
    return r?.p ?? null
  }
  if (entityType === 'deliverable') {
    const [r] = await db.select({ p: deliverables.propertyId }).from(deliverables).where(and(eq(deliverables.id, entityId), eq(deliverables.organizationId, organizationId), isNull(deliverables.deletedAt))).limit(1)
    return r?.p ?? null
  }
  const [co] = await db.select({ wo: changeOrders.workOrderId, inv: changeOrders.invoiceId }).from(changeOrders)
    .where(and(eq(changeOrders.id, entityId), eq(changeOrders.organizationId, organizationId), isNull(changeOrders.deletedAt))).limit(1)
  if (!co) return null
  if (co.wo) {
    const [w] = await db.select({ p: workOrders.propertyId }).from(workOrders).where(eq(workOrders.id, co.wo)).limit(1)
    return w?.p ?? null
  }
  if (co.inv) {
    const [i] = await db.select({ p: invoices.propertyId }).from(invoices).where(eq(invoices.id, co.inv)).limit(1)
    return i?.p ?? null
  }
  return null
}

export class RealSignatureService implements ISignatureService {
  constructor(
    private readonly tenantResolver?: TenantResolver,
    private readonly requestMeta: () => RequestMeta = () => ({ ipAddress: null, userAgent: null }),
  ) {}

  /** Staff may sign anything in the org; a homeowner only quotes / change orders on their properties. */
  private async assertMaySign(organizationId: string, entityType: SignedEntityType, propertyId: string, read = false): Promise<string | null> {
    const userId = resolveActorUserId(this.tenantResolver)
    if (!userId) return null // system context (e.g. imports) — tenant already asserted
    const [m] = await getDb().select({ role: memberships.role }).from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId), eq(memberships.isActive, true))).limit(1)
    const role = m?.role ?? ''
    if ((read ? STAFF_READ : STAFF).has(role)) return userId
    if (role === 'homeowner' && HOMEOWNER_SIGNABLE.has(entityType)) {
      const [link] = await getDb().select({ p: homeownerUsers.propertyId }).from(homeownerUsers).where(and(
        eq(homeownerUsers.userId, userId), eq(homeownerUsers.organizationId, organizationId),
        eq(homeownerUsers.propertyId, propertyId), isNull(homeownerUsers.deletedAt),
      )).limit(1)
      if (link) return userId
    }
    throw new ForbiddenError(`Role ${role || 'unknown'} may not sign this ${entityType}`)
  }

  async create(input: SignatureCreateInput): Promise<Signature> {
    const parsed = SignatureCreateInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid signature: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const v = parsed.data
    assertSameTenant(this.tenantResolver, v.organizationId)
    const propertyId = await entityPropertyId(v.entityType, v.entityId, v.organizationId)
    if (!propertyId) throw new Error(`Invalid signature: ${v.entityType} not found`)
    const signerUserId = await this.assertMaySign(v.organizationId, v.entityType, propertyId)
    if (v.imageKey) await assertOwnedAssetKey(v.imageKey, v.organizationId, 'document')
    const meta = this.requestMeta()
    return await withAudit(async ({ tx, audit }) => {
      const [row] = await tx.insert(signatures).values({
        organizationId: v.organizationId,
        entityType: v.entityType,
        entityId: v.entityId,
        signerName: v.signerName,
        signerEmail: v.signerEmail ?? null,
        signerUserId,
        method: v.method,
        imageKey: v.imageKey ?? null,
        consent: true,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        documentHash: v.documentHash,
      }).returning()
      await audit.record({
        organizationId: v.organizationId,
        entityType: v.entityType,
        entityId: v.entityId,
        action: 'state_change',
        actorUserId: signerUserId,
        metadata: { kind: 'signed', signatureId: row!.id, method: v.method, documentHash: v.documentHash },
      })
      return toContract(row!)
    })
  }

  async get(id: string, organizationId: string): Promise<Signature | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const [row] = await getDb().select().from(signatures).where(and(eq(signatures.id, id), eq(signatures.organizationId, organizationId))).limit(1)
    if (!row) return null
    await this.assertMayRead(organizationId, row.entityType as SignedEntityType, row.entityId)
    return toContract(row)
  }

  private async assertMayRead(organizationId: string, entityType: SignedEntityType, entityId: string): Promise<void> {
    const propertyId = await entityPropertyId(entityType, entityId, organizationId)
    if (!propertyId) throw new Error(`${entityType} not found`)
    await this.assertMaySign(organizationId, entityType, propertyId, true)
  }

  async listForEntity(input: { organizationId: string, entityType: SignedEntityType, entityId: string }): Promise<Signature[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    await this.assertMayRead(input.organizationId, input.entityType, input.entityId)
    const rows = await getDb().select().from(signatures).where(and(
      eq(signatures.organizationId, input.organizationId), eq(signatures.entityType, input.entityType), eq(signatures.entityId, input.entityId),
    )).orderBy(asc(signatures.signedAt))
    return rows.map(toContract)
  }

  async verify(input: { organizationId: string, id: string, documentHash: string }): Promise<{ valid: boolean }> {
    const sig = await this.get(input.id, input.organizationId)
    if (!sig) throw new Error('Signature not found')
    return { valid: sig.documentHash === input.documentHash.toLowerCase() }
  }
}
