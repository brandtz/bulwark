/**
 * server/services/standards.real.ts — RealStandardsService (E11 — folded into S6).
 *
 * # Decisions (ADR-0008)
 *   - One row per organization; `organizationId` is the PK on the
 *     `compliance_standards` table. `get()` falls back to the Oregon
 *     baseline when no row exists.
 *   - `save()` is a full replace via INSERT ... ON CONFLICT (organizationId)
 *     DO UPDATE — same row count guaranteed (zero or one).
 *   - Audit-logged on save: action='update' with before/after standards.
 */
import { eq } from 'drizzle-orm'
import type { ComplianceStandards } from '../../shared/contracts/assessment'
import type { IStandardsService, StandardsRow } from '../../shared/contracts/standards'
import { OREGON_DEFAULT_STANDARDS } from '../../shared/utils/compliance'
import { getDb } from '../db/client'
import { complianceStandards } from '../db/schema/standards'
import type { ComplianceStandardsRow as DbStd } from '../db/schema/standards'
import { assertSameTenant, type TenantResolver } from './_tenant'
import { withAudit } from './_tx'

function rowToContract(r: DbStd): StandardsRow {
  return {
    organizationId: r.organizationId,
    standards: {
      compliantRoofMaterials: r.compliantRoofMaterials,
      compliantSidingMaterials: r.compliantSidingMaterials,
      compliantEaveTypes: r.compliantEaveTypes,
      compliantVentTypes: r.compliantVentTypes,
      requireDefensibleSpace: r.requireDefensibleSpace,
    },
    updatedAt: r.updatedAt.toISOString(),
    updatedById: r.updatedById,
  }
}

export class RealStandardsService implements IStandardsService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async get(orgId: string): Promise<StandardsRow> {
    assertSameTenant(this.tenantResolver, orgId)
    const db = getDb()
    const [row] = await db
      .select()
      .from(complianceStandards)
      .where(eq(complianceStandards.organizationId, orgId))
      .limit(1)
    if (!row) {
      // Synthetic "current" row for the fallback so the UI gets a
      // consistent shape on first read.
      return {
        organizationId: orgId,
        standards: OREGON_DEFAULT_STANDARDS,
        updatedAt: new Date().toISOString(),
        updatedById: null,
      }
    }
    return rowToContract(row)
  }

  async save(orgId: string, standards: ComplianceStandards, updatedById: string | null): Promise<StandardsRow> {
    assertSameTenant(this.tenantResolver, orgId)
    return await withAudit(async ({ tx, audit }) => {
      const [before] = await tx
        .select()
        .from(complianceStandards)
        .where(eq(complianceStandards.organizationId, orgId))
        .limit(1)

      const values = {
        organizationId: orgId,
        compliantRoofMaterials: standards.compliantRoofMaterials,
        compliantSidingMaterials: standards.compliantSidingMaterials,
        compliantEaveTypes: standards.compliantEaveTypes,
        compliantVentTypes: standards.compliantVentTypes,
        requireDefensibleSpace: standards.requireDefensibleSpace,
        updatedById,
      }

      const [row] = await tx
        .insert(complianceStandards)
        .values(values)
        .onConflictDoUpdate({
          target: complianceStandards.organizationId,
          set: { ...values, updatedAt: new Date() },
        })
        .returning()

      await audit.record({
        organizationId: orgId,
        entityType: 'compliance_standards',
        entityId: orgId,
        action: before ? 'update' : 'create',
        actorUserId: updatedById,
        before: before ? rowToContract(before).standards as unknown as Record<string, unknown> : null,
        after: standards as unknown as Record<string, unknown>,
      })

      return rowToContract(row!)
    })
  }
}
