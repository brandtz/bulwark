/**
 * server/services/_row-mappers.ts — DB row ↔ contract DTO mappers.
 *
 * # Decisions (ADR-0008)
 *   - Drizzle returns `timestamp` columns as `Date`. Contracts use ISO
 *     strings (per shared/contracts/_shared.ts AuditFieldsSchema). Every
 *     Real service runs its rows through one of these mappers before
 *     handing them back to UI/API code.
 *   - Mappers are dumb. No schema validation here — that's the caller's
 *     job at API boundaries (E11-S4 server route layer).
 */
import type { Property as DbProperty } from '../db/schema/properties'
import type { Client as DbClient } from '../db/schema/clients'
import type { Property } from '../../shared/contracts/property'
import type { Client } from '../../shared/contracts/client'

// shared/contracts/client.ts encodes preferredContact as the literal union
// 'email'|'phone'|'sms'|null. The DB stores it as text.
type Pc = 'email' | 'phone' | 'sms' | null

export function dbPropertyToContract(r: DbProperty): Property {
  return {
    id: r.id,
    organizationId: r.organizationId,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    postalCode: r.postalCode,
    clientId: r.clientId,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}

export function dbClientToContract(r: DbClient): Client {
  // We trust the DB but coerce the text column to the union shape; if
  // somehow corrupted we fall through to null.
  const pc: Pc =
    r.preferredContact === 'email' || r.preferredContact === 'phone' || r.preferredContact === 'sms'
      ? r.preferredContact
      : null
  return {
    id: r.id,
    organizationId: r.organizationId,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    preferredContact: pc,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  }
}
