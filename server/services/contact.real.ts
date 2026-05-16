/**
 * server/services/contact.real.ts — RealContactService (W2-1 / EH-E / ADR-0018).
 *
 * # Decisions (ADR-0008)
 *   - `setPrimary` and `create({ isPrimary: true })` both demote sibling
 *     rows whose `property_id` matches in the same transaction.
 *   - Service-layer invariant: at least one of `propertyId` or
 *     `clientId` must be set on create. The DB columns are nullable to
 *     leave room for a future tenant-wide rolodex without migration.
 *   - `setPrimary` requires `propertyId` — "primary" is a per-property
 *     concept in W2-1; client-scoped primary is deferred.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type {
  Contact,
  ContactCreateInput,
  ContactUpdateInput,
  IContactService,
} from '../../shared/contracts/contact'
import { getDb } from '../db/client'
import { contacts } from '../db/schema/contacts'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'
import { dbContactToContract } from './_row-mappers'

export class RealContactService implements IContactService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  private actorUserId(): string | null {
    return this.tenantResolver?.()?.userId ?? null
  }

  async list(organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.organizationId, organizationId), sql`${contacts.deletedAt} IS NULL`),
      )
      .orderBy(asc(contacts.sortOrder), asc(contacts.createdAt))
    return rows.map(dbContactToContract)
  }

  async listForProperty(propertyId: string, organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          eq(contacts.propertyId, propertyId),
          sql`${contacts.deletedAt} IS NULL`,
        ),
      )
      .orderBy(sql`${contacts.isPrimary} DESC`, asc(contacts.sortOrder), asc(contacts.createdAt))
    return rows.map(dbContactToContract)
  }

  async listForClient(clientId: string, organizationId: string): Promise<Contact[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          eq(contacts.clientId, clientId),
          sql`${contacts.deletedAt} IS NULL`,
        ),
      )
      .orderBy(asc(contacts.sortOrder), asc(contacts.createdAt))
    return rows.map(dbContactToContract)
  }

  async get(id: string, organizationId: string): Promise<Contact | null> {
    assertSameTenant(this.tenantResolver, organizationId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.organizationId, organizationId),
          sql`${contacts.deletedAt} IS NULL`,
        ),
      )
      .limit(1)
    return row ? dbContactToContract(row) : null
  }

  async create(input: ContactCreateInput): Promise<Contact> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    const propertyId = input.propertyId ?? null
    const clientId = input.clientId ?? null
    if (!propertyId && !clientId) {
      throw new Error('Contact requires propertyId or clientId')
    }
    const wantsPrimary = input.isPrimary === true
    if (wantsPrimary && !propertyId) {
      throw new Error('Cannot set primary on a contact without propertyId')
    }
    return await withAudit(async ({ tx, audit }) => {
      if (wantsPrimary && propertyId) {
        await tx
          .update(contacts)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(
              eq(contacts.organizationId, input.organizationId),
              eq(contacts.propertyId, propertyId),
              eq(contacts.isPrimary, true),
              sql`${contacts.deletedAt} IS NULL`,
            ),
          )
      }
      const [row] = await tx
        .insert(contacts)
        .values({
          organizationId: input.organizationId,
          propertyId,
          clientId,
          kind: input.kind ?? 'other',
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          isPrimary: wantsPrimary,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'contact',
        entityId: row!.id,
        action: 'create',
        actorUserId: this.actorUserId(),
        after: { firstName: row!.firstName, lastName: row!.lastName, kind: row!.kind },
      })
      return dbContactToContract(row!)
    })
  }

  async update(input: ContactUpdateInput): Promise<Contact> {
    assertSameTenant(this.tenantResolver, input.organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, input.id), eq(contacts.organizationId, input.organizationId)))
        .limit(1)
      if (!before || before.deletedAt) throw new Error('Contact not found')
      const patch: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() }
      if (input.kind !== undefined) patch.kind = input.kind
      if (input.firstName !== undefined) patch.firstName = input.firstName
      if (input.lastName !== undefined) patch.lastName = input.lastName
      if (input.email !== undefined) patch.email = input.email ?? null
      if (input.phone !== undefined) patch.phone = input.phone ?? null
      if (input.notes !== undefined) patch.notes = input.notes ?? null
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
      if (input.isPrimary !== undefined) {
        if (input.isPrimary && !before.propertyId) {
          throw new Error('Cannot set primary on a contact without propertyId')
        }
        if (input.isPrimary && before.propertyId) {
          await tx
            .update(contacts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(contacts.organizationId, input.organizationId),
                eq(contacts.propertyId, before.propertyId),
                eq(contacts.isPrimary, true),
                ne(contacts.id, input.id),
                sql`${contacts.deletedAt} IS NULL`,
              ),
            )
        }
        patch.isPrimary = input.isPrimary
      }
      const [after] = await tx
        .update(contacts)
        .set(patch)
        .where(and(eq(contacts.id, input.id), eq(contacts.organizationId, input.organizationId)))
        .returning()
      await audit.record({
        organizationId: input.organizationId,
        entityType: 'contact',
        entityId: input.id,
        action: 'update',
        actorUserId: this.actorUserId(),
        before: { firstName: before.firstName, lastName: before.lastName, isPrimary: before.isPrimary },
        after: { firstName: after!.firstName, lastName: after!.lastName, isPrimary: after!.isPrimary },
      })
      return dbContactToContract(after!)
    })
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    assertSameTenant(this.tenantResolver, organizationId)
    await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)))
        .limit(1)
      if (!before) throw new Error('Contact not found')
      const now = new Date()
      await tx
        .update(contacts)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)))
      await audit.record({
        organizationId,
        entityType: 'contact',
        entityId: id,
        action: 'delete',
        actorUserId: this.actorUserId(),
        before: { firstName: before.firstName, lastName: before.lastName },
      })
    })
  }

  async setPrimary(id: string, organizationId: string): Promise<Contact> {
    assertSameTenant(this.tenantResolver, organizationId)
    return await withAudit(async ({ tx, audit }) => {
      const [target] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)))
        .limit(1)
      if (!target || target.deletedAt) throw new Error('Contact not found')
      if (!target.propertyId) {
        throw new Error('Cannot set primary on a contact without propertyId')
      }
      const now = new Date()
      // Demote siblings first.
      await tx
        .update(contacts)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(contacts.organizationId, organizationId),
            eq(contacts.propertyId, target.propertyId),
            eq(contacts.isPrimary, true),
            ne(contacts.id, id),
            sql`${contacts.deletedAt} IS NULL`,
          ),
        )
      const [after] = await tx
        .update(contacts)
        .set({ isPrimary: true, updatedAt: now })
        .where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)))
        .returning()
      await audit.record({
        organizationId,
        entityType: 'contact',
        entityId: id,
        action: 'state_change',
        actorUserId: this.actorUserId(),
        metadata: { setPrimary: true, propertyId: target.propertyId },
      })
      return dbContactToContract(after!)
    })
  }
}
