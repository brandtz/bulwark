/**
 * shared/mocks/signature.mock.ts — MockSignatureService (WP-X2, ED-00D).
 * Append-only, in memory. Entity existence and role scoping are enforced by the
 * real service only (they need the database).
 */
import {
  SignatureCreateInputSchema,
  type ISignatureService,
  type Signature,
  type SignatureCreateInput,
  type SignedEntityType,
} from '../contracts/signature'
import { assertSameTenant, type TenantResolver } from './tenant'

export class MockSignatureService implements ISignatureService {
  private rows: Signature[] = []

  constructor(private readonly tenantResolver?: TenantResolver) {}

  async create(input: SignatureCreateInput): Promise<Signature> {
    const parsed = SignatureCreateInputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`Invalid signature: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
    const v = parsed.data
    assertSameTenant(this.tenantResolver, v.organizationId)
    const row: Signature = {
      id: globalThis.crypto.randomUUID(),
      organizationId: v.organizationId,
      entityType: v.entityType,
      entityId: v.entityId,
      signerName: v.signerName,
      signerEmail: v.signerEmail ?? null,
      signerUserId: this.tenantResolver?.()?.userId ?? null,
      method: v.method,
      imageKey: v.imageKey ?? null,
      consent: true,
      ipAddress: null,
      userAgent: null,
      documentHash: v.documentHash,
      signedAt: new Date().toISOString(),
    }
    this.rows.push(row)
    return row
  }

  async get(id: string, organizationId: string): Promise<Signature | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    return this.rows.find((r) => r.id === id && r.organizationId === organizationId) ?? null
  }

  async listForEntity(input: { organizationId: string, entityType: SignedEntityType, entityId: string }): Promise<Signature[]> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return this.rows.filter((r) => r.organizationId === input.organizationId && r.entityType === input.entityType && r.entityId === input.entityId)
  }

  async verify(input: { organizationId: string, id: string, documentHash: string }): Promise<{ valid: boolean }> {
    const sig = await this.get(input.id, input.organizationId)
    if (!sig) throw new Error('Signature not found')
    return { valid: sig.documentHash === input.documentHash.toLowerCase() }
  }
}
