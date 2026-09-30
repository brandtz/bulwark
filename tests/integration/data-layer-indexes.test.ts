/**
 * tests/integration/data-layer-indexes.test.ts — WP-L06 S1.
 *
 * The primary org-scoped list query of each hot table must be index-backed.
 * Test databases are tiny, so the planner would pick a seq scan anyway; with
 * `enable_seqscan = off` and `enable_sort = off` (tx-local) the plan shows
 * whether an index CAN serve the query shape, ordering included. Each assertion names the index expected for that shape
 * (status filters may be served by either org index: on tiny tables the planner
 * prefers org_created + filter; status selectivity picks org_status_created at volume).
 */
import { afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, getDb } from '../../server/db/client'

const HAS_DB = !!process.env.DATABASE_URL
const d = HAS_DB ? describe : describe.skip
const ORG = '00000000-0000-4000-8000-000000000a06'
const PROP = '00000000-0000-4000-8000-000000000a07'

async function plan(query: string): Promise<string> {
  return await getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL enable_seqscan = off`)
    // On a near-empty table (fresh CI database) the planner prefers any
    // org-leading index plus an in-memory Sort. Discouraging the Sort asks the
    // real question: can an index deliver the ORDER BY for this org?
    await tx.execute(sql`SET LOCAL enable_sort = off`)
    const rows = await tx.execute(sql.raw(`EXPLAIN ${query}`)) as unknown as Array<Record<string, string>>
    return rows.map((r) => r['QUERY PLAN']).join('\n')
  })
}

d('hot list queries are index-backed (WP-L06 S1)', () => {
  afterAll(async () => {
    await closeDb()
  })

  // [name, query, expected index, paged]. Paged lists use the ORDER BY that
  // pageWindow emits (server/services/_pagination.ts) and must get created_at
  // order from the index: an Incremental Sort for equal timestamps is fine, a
  // full Sort of the org's rows is not.
  const cases: Array<[string, string, string, boolean?]> = [
    ['properties default list', `SELECT * FROM properties WHERE organization_id = '${ORG}' AND deleted_at IS NULL ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'properties_org_created_idx', true],
    ['properties by status', `SELECT * FROM properties WHERE organization_id = '${ORG}' AND deleted_at IS NULL AND status = 'lead' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'properties_org_status_created_idx|properties_org_created_idx', true],
    ['quotes default list', `SELECT * FROM quotes WHERE organization_id = '${ORG}' AND deleted_at IS NULL ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'quotes_org_created_idx', true],
    ['quotes by status', `SELECT * FROM quotes WHERE organization_id = '${ORG}' AND deleted_at IS NULL AND status = 'sent' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'quotes_org_status_created_idx|quotes_org_created_idx', true],
    ['quotes by property', `SELECT * FROM quotes WHERE organization_id = '${ORG}' AND property_id = '${PROP}'`, 'quotes_org_property_idx'],
    ['invoices default list', `SELECT * FROM invoices WHERE organization_id = '${ORG}' AND deleted_at IS NULL ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'invoices_org_created_idx', true],
    ['invoices by status', `SELECT * FROM invoices WHERE organization_id = '${ORG}' AND deleted_at IS NULL AND status = 'sent' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'invoices_org_status_created_idx|invoices_org_created_idx', true],
    ['work orders default list', `SELECT * FROM work_orders WHERE organization_id = '${ORG}' AND deleted_at IS NULL ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'work_orders_org_created_idx', true],
    ['work orders by status', `SELECT * FROM work_orders WHERE organization_id = '${ORG}' AND deleted_at IS NULL AND status = 'scheduled' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 25`, 'work_orders_org_status_created_idx|work_orders_org_created_idx', true],
    ['inspections by property', `SELECT * FROM inspections WHERE organization_id = '${ORG}' AND property_id = '${PROP}' AND deleted_at IS NULL ORDER BY created_at DESC`, 'inspections_org_property_created_idx'],
    ['audit log filter (newest first)', `SELECT * FROM audit_log WHERE organization_id = '${ORG}' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 50`, 'audit_log_org_(created|entity)_idx', true],
    ['audit entity timeline', `SELECT * FROM audit_log WHERE organization_id = '${ORG}' AND entity_type = 'quote' AND entity_id = '${PROP}' ORDER BY created_at DESC`, 'audit_log_org_(entity|created)_idx'],
    ['notifications for a user', `SELECT * FROM notifications WHERE organization_id = '${ORG}' AND user_id = '${PROP}' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 50`, 'notifications_org_user_created_idx|notifications_org_user_idx', true],
    ['property photos', `SELECT * FROM property_photos WHERE organization_id = '${ORG}' AND property_id = '${PROP}' AND deleted_at IS NULL ORDER BY sort_order`, 'property_photos_org_property_idx'],
    ['quote number lookup', `SELECT 1 FROM quotes WHERE organization_id = '${ORG}' AND quote_number = 'Q-2026-0001'`, 'quotes_org_(number_unique|property_idx|created_idx|status_created_idx)'],
  ]

  for (const [name, query, index, paged] of cases) {
    it(`${name} uses ${index}`, async () => {
      const text = await plan(query)
      expect(text).toMatch(new RegExp(index))
      expect(text).not.toMatch(/Seq Scan/)
      if (paged) expect(text, 'the index must deliver created_at order').not.toMatch(/(?<!Incremental )Sort {2}\(/u)
    })
  }
})
