/**
 * scripts/db-seed.mjs — seed demo orgs, users, AND domain fixtures for
 * the real backend (E11 + e2e cutover).
 *
 * # Decisions (ADR-0008, ADR-0012)
 *   - Idempotent: re-running the script must not duplicate rows.
 *     Uses INSERT ... ON CONFLICT DO UPDATE on natural keys.
 *   - Mirrors `shared/mocks/fixtures.ts` so persona-matrix + happy-path
 *     specs work identically against `BULWARK_BACKEND=real`.
 *   - Plain postgres-js + raw SQL on purpose. The schema barrel uses
 *     bare imports that break Node ESM resolution outside Nuxt — same
 *     reason `db-smoke.mjs` and `db-roundtrip.mjs` skipped Drizzle.
 *   - Slug-based IDs via SHA256→UUIDv4 so re-runs yield stable rows
 *     and FK joins stay consistent across orgs/properties/quotes/etc.
 *
 * # Decisions cast down
 *   - Random passwords. Rejected — fixtures must be deterministic for
 *     Playwright. Demo password is `BulwarkDemo!1`.
 *   - Importing fixtures.ts directly. Rejected — the mock `mk()` produces
 *     non-hex chars (postgres uuid rejects); we'd have to translate every
 *     ID anyway. Easier to redeclare the slugs here in plain SQL/JS.
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Hand-load .env.local (no dotenv dep needed; same parser as tests/setup/env.ts).
try {
  const text = readFileSync('.env.local', 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
} catch { /* file optional */ }

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

// Production safety guard — refuse to wipe-and-seed any database that isn't
// clearly a local Postgres. Demo fixtures are dev-only (ADR-0008); running
// this script against Neon prod/staging would destroy real-customer rows in
// the `Bulwark Demo Co.` and `Acme Restoration` orgs (and only those — the
// wipe is org-scoped — but still: no).
const ALLOW_PROD_SEED = process.env.BULWARK_ALLOW_PROD_SEED === '1'
const isLocalHost = /(@|\/\/)(localhost|127\.0\.0\.1|::1)(:\d+)?\//.test(url)
if (!isLocalHost && !ALLOW_PROD_SEED) {
  console.error(
    'Refusing to run db-seed.mjs against a non-localhost DATABASE_URL.\n' +
      `  host parsed from URL: ${(url.match(/@([^/:]+)/) ?? [])[1] ?? '<unknown>'}\n` +
      '  This script wipes-and-seeds demo fixtures (ADR-0008) and is dev-only.\n' +
      '  If you know what you are doing, set BULWARK_ALLOW_PROD_SEED=1 and re-run.',
  )
  process.exit(1)
}

const sql = postgres(url, { max: 4 })

const DEMO_PASSWORD = 'BulwarkDemo!1'
const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

/** Build a deterministic UUIDv4 from a slug (sha256 → 32 hex → reshape). */
const mk = (slug) => {
  const h = createHash('sha256').update(slug).digest('hex').slice(0, 32)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${variant}${h.slice(17,20)}-${h.slice(20,32)}`
}

const NOW = '2026-05-03T20:00:00.000Z'
const PAST_ISO = '2026-04-15T17:00:00.000Z'
const NEAR_FUTURE_ISO = '2026-05-30T17:00:00.000Z'

// ----------------------------------------------------------------------------
// Orgs + users
// ----------------------------------------------------------------------------
const ORG_BULWARK = { id: mk('org-bulwark-demo'), name: 'Bulwark Demo Co.', slug: 'bulwark-demo' }
const ORG_ACME = { id: mk('org-acme-restoration'), name: 'Acme Restoration LLC', slug: 'acme-restoration' }

const USER_ADMIN_ID = mk('user-drew-admin')
const USER_FIELD_ID = mk('user-matthew-field')
const USER_SUB_ID = mk('user-jeff-sub')
const USER_SUPER_ID = mk('user-sasha-super')
const USER_RESET_VICTIM_ID = mk('user-reset-victim')
// Role-coverage personas added by EH-C: every membership role represented
// per customer org so role-guard / settings / persona-matrix specs can
// exercise the full matrix without churning.
const USER_MANAGER_ID = mk('user-morgan-manager')
const USER_VIEWER_ID = mk('user-vivian-viewer')
const USER_ACME_ADMIN_ID = mk('user-ana-acme-admin')
const USER_ACME_MANAGER_ID = mk('user-mike-acme-manager')
const USER_ACME_FIELD_ID = mk('user-felix-acme-field')
const USER_ACME_SUB_ID = mk('user-sam-acme-sub')
const USER_ACME_VIEWER_ID = mk('user-val-acme-viewer')

const PERSONAS = [
  { id: USER_ADMIN_ID, email: 'drew@bulwark.demo',      fullName: 'Drew Owens',    memberships: [{ orgId: ORG_BULWARK.id, role: 'org_admin' }] },
  { id: USER_FIELD_ID, email: 'matthew@bulwark.demo',   fullName: 'Matthew Reyes', memberships: [{ orgId: ORG_BULWARK.id, role: 'field' }] },
  { id: USER_SUB_ID,   email: 'jeff@bulwark.demo',      fullName: 'Jeff Park',     memberships: [{ orgId: ORG_BULWARK.id, role: 'sub_contractor' }] },
  { id: USER_SUPER_ID, email: 'sasha@bulwark.platform', fullName: 'Sasha Liu',
    memberships: [{ orgId: ORG_BULWARK.id, role: 'super_admin' }, { orgId: ORG_ACME.id, role: 'super_admin' }] },
  // Throwaway user for auth-recovery tests so the destructive password reset
  // never touches drew@bulwark.demo (which 90% of e2e specs depend on).
  { id: USER_RESET_VICTIM_ID, email: 'reset-victim@bulwark.demo', fullName: 'Reset Victim', memberships: [{ orgId: ORG_BULWARK.id, role: 'org_admin' }] },
  // Role-coverage padding (EH-C): manager + viewer on Bulwark Demo Co.
  { id: USER_MANAGER_ID, email: 'morgan@bulwark.demo',  fullName: 'Morgan Pratt',  memberships: [{ orgId: ORG_BULWARK.id, role: 'org_manager' }] },
  { id: USER_VIEWER_ID,  email: 'vivian@bulwark.demo',  fullName: 'Vivian Chu',    memberships: [{ orgId: ORG_BULWARK.id, role: 'viewer' }] },
  // Full role matrix on Acme Restoration so cross-tenant + role-guard
  // specs have a complete second org to exercise.
  { id: USER_ACME_ADMIN_ID,   email: 'ana@acme.demo',   fullName: 'Ana Solis',     memberships: [{ orgId: ORG_ACME.id, role: 'org_admin' }] },
  { id: USER_ACME_MANAGER_ID, email: 'mike@acme.demo',  fullName: 'Mike Donovan',  memberships: [{ orgId: ORG_ACME.id, role: 'org_manager' }] },
  { id: USER_ACME_FIELD_ID,   email: 'felix@acme.demo', fullName: 'Felix Romero',  memberships: [{ orgId: ORG_ACME.id, role: 'field' }] },
  { id: USER_ACME_SUB_ID,     email: 'sam@acme.demo',   fullName: 'Sam Kohli',     memberships: [{ orgId: ORG_ACME.id, role: 'sub_contractor' }] },
  { id: USER_ACME_VIEWER_ID,  email: 'val@acme.demo',   fullName: 'Val Hayes',     memberships: [{ orgId: ORG_ACME.id, role: 'viewer' }] },
]

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------
const CLIENTS = [
  { id: mk('client-1'), fullName: 'Sandra Mitchell',   email: 'sandra@example.com', phone: '+1-555-0101', preferredContact: 'phone', notes: 'Prefers afternoon visits.' },
  { id: mk('client-2'), fullName: 'Robert & Lisa Tan', email: 'rtan@example.com',   phone: '+1-555-0102', preferredContact: 'email', notes: null },
  { id: mk('client-3'), fullName: 'Hector Alvarez',    email: null,                 phone: '+1-555-0103', preferredContact: 'phone', notes: 'Spanish preferred.' },
  { id: mk('client-4'), fullName: 'Patricia Whitfield',email: 'pwhit@example.com',  phone: '+1-555-0104', preferredContact: 'email', notes: null },
  { id: mk('client-5'), fullName: 'Marcus Henderson',  email: 'mh@example.com',     phone: '+1-555-0105', preferredContact: 'sms',   notes: null },
]

// ----------------------------------------------------------------------------
// Properties — at least one row per PropertyStatus so the pipeline kanban
// has every column populated on first paint (E3-S1).
// ----------------------------------------------------------------------------
const PROPERTY_SEED = [
  ['1428 Hillcrest Ave',   'lead',                'Oakland',      'CA'],
  ['872 Skyline Blvd',     'scheduled',           'Berkeley',     'CA'],
  ['355 Grizzly Peak',     'assessed',            'Oakland',      'CA'],
  ['9011 Pinehurst Rd',    'quoted',              'Orinda',       'CA'],
  ['244 Vista Drive',      'accepted',            'Lafayette',    'CA'],
  ['612 Ridgemont Way',    'in_progress',         'Moraga',       'CA'],
  ['1801 Sunset Trail',    'completed',           'Walnut Creek', 'CA'],
  ['77 Oakhill Court',     'compliance_pending',  'Pleasant Hill','CA'],
  ['338 Coyote Hills',     'compliance_complete', 'Fremont',      'CA'],
  ['915 Eagle Ridge',      'invoiced',            'Concord',      'CA'],
  ['200 Foothill Blvd',    'paid',                'Oakland',      'CA'],
  ['456 Forest View',      'on_hold',             'Berkeley',     'CA'],
  ['1290 Canyon Heights',  'in_progress',         'Moraga',       'CA'],
]
const PROPERTIES = PROPERTY_SEED.map(([line1, status, city, state], i) => ({
  id: mk(`property-${i + 1}`),
  addressLine1: line1,
  city,
  state,
  postalCode: '94' + String(500 + i).padStart(3, '0'),
  clientId: CLIENTS[i % CLIENTS.length].id,
  status,
}))
const SEED_PROPERTY = PROPERTIES.find((p) => p.status === 'accepted')

// ----------------------------------------------------------------------------
// Subcontractors (E6)
// ----------------------------------------------------------------------------
const SUBCONTRACTORS = [
  {
    id: mk('sub-roof-king'),
    companyName: 'Roof King Co.',
    contactName: 'Mateo Ruiz',
    email: 'mateo@roofking.test',
    phone: '+1-555-0201',
    trades: ['roofing', 'gutters'],
    licenseNumber: 'CCB-228114',
    licenseExpiresAt: '2027-04-30T00:00:00.000Z',
    notes: 'Preferred metal-roof partner.',
  },
  {
    id: mk('sub-cascade-siding'),
    companyName: 'Cascade Siding LLC',
    contactName: 'Priya Shah',
    email: 'priya@cascadesiding.test',
    phone: '+1-555-0202',
    trades: ['siding', 'eaves_vents'],
    licenseNumber: 'CCB-118842',
    licenseExpiresAt: '2026-12-15T00:00:00.000Z',
    notes: null,
  },
  {
    id: mk('sub-firebreak-clearing'),
    companyName: 'Firebreak Clearing',
    contactName: 'Jordan Wells',
    email: null,
    phone: '+1-555-0203',
    trades: ['defensible_space', 'general_labor'],
    licenseNumber: null,
    licenseExpiresAt: null,
    notes: 'No CCB — unlicensed labor only.',
  },
]

// ----------------------------------------------------------------------------
// Assessment for the 'assessed' property (so Quote builder pre-population
// has something to read in real-backend mode).
// ----------------------------------------------------------------------------
const ASSESSED_PROPERTY = PROPERTIES.find((p) => p.status === 'assessed')
const SEED_ASSESSMENT = {
  id: mk('assessment-seed-1'),
  propertyId: ASSESSED_PROPERTY.id,
  assessedById: USER_FIELD_ID,
  assessedAt: '2026-04-20T17:00:00.000Z',
  roofMaterial: 'wood_shake',
  sidingMaterial: 'wood',
  eaveType: 'open',
  ventType: 'unscreened',
  defensibleSpaceCleared: false,
  notes: 'Multiple non-compliant findings; recommend full-scope retrofit.',
}

// ----------------------------------------------------------------------------
// Quote for the 'accepted' property — required FK target for the seed WO.
// ----------------------------------------------------------------------------
const SEED_QUOTE_ID = mk('quote-seed')
const SEED_QUOTE_LINE_ITEMS = [
  {
    id: mk('quote-line-1'),
    kind: 'labor',
    description: 'Roof replacement — class A metal',
    quantity: 1,
    unitCostCents: 1850000,
    sourceField: '',
  },
  {
    id: mk('quote-line-2'),
    kind: 'material',
    description: 'Steel roof panels (charcoal)',
    quantity: 28,
    unitCostCents: 6500,
    sourceField: '',
  },
]
const SEED_QUOTE_TOTALS = (() => {
  const subtotal = SEED_QUOTE_LINE_ITEMS.reduce((s, li) => s + li.quantity * li.unitCostCents, 0)
  return { subtotalCents: subtotal, markupCents: 0, taxCents: 0, totalCents: subtotal }
})()
const SEED_QUOTE = {
  id: SEED_QUOTE_ID,
  propertyId: SEED_PROPERTY.id,
  assessmentId: null,
  createdById: USER_ADMIN_ID,
  quoteNumber: 'Q-2026-0001',
  status: 'accepted',
  issuedAt: '2026-04-25T17:00:00.000Z',
  sentAt: '2026-04-25T17:00:00.000Z',
  acceptedAt: '2026-04-28T17:00:00.000Z',
  expiresAt: NEAR_FUTURE_ISO,
  lineItems: SEED_QUOTE_LINE_ITEMS,
  markupPercent: 0,
  taxPercent: 0,
  notes: null,
  totals: SEED_QUOTE_TOTALS,
  totalCents: SEED_QUOTE_TOTALS.totalCents,
}

// ----------------------------------------------------------------------------
// Work order — bound to the accepted property + the seed quote.
// ----------------------------------------------------------------------------
const SEED_WO_ID = mk('wo-seed-1')
const SEED_WO_TRADE_SLOTS = [
  {
    id: mk('slot-roofing'),
    trade: 'roofing',
    description: 'Replace wood shake roof with class-A metal',
    status: 'assigned',
    assignedSubcontractorId: mk('sub-roof-king'),
    scheduledStart: '2026-05-12T15:00:00.000Z',
    scheduledEnd: '2026-05-14T00:00:00.000Z',
    notes: null,
  },
  {
    id: mk('slot-defensible'),
    trade: 'defensible_space',
    description: 'Clear 30-foot defensible-space radius',
    status: 'unassigned',
    assignedSubcontractorId: null,
    scheduledStart: null,
    scheduledEnd: null,
    notes: null,
  },
]
const SEED_WO_MATERIALS = [
  { id: mk('mat-metal-panels'),  name: 'Steel roof panels (charcoal)', quantity: 28, unit: 'panel', unitCostCents: 6500 },
  { id: mk('mat-underlayment'),  name: 'Synthetic underlayment',       quantity: 6,  unit: 'roll',  unitCostCents: 8200 },
]
const SEED_WO = {
  id: SEED_WO_ID,
  propertyId: SEED_PROPERTY.id,
  quoteId: SEED_QUOTE_ID,
  workOrderNumber: 'WO-2026-0001',
  status: 'scheduled',
  scheduledStart: '2026-05-12T15:00:00.000Z',
  scheduledEnd: '2026-05-15T23:00:00.000Z',
  tradeSlots: SEED_WO_TRADE_SLOTS,
  materials: SEED_WO_MATERIALS,
  notes: 'Customer requested early-morning starts; access via side gate.',
  createdById: USER_ADMIN_ID,
}

// ----------------------------------------------------------------------------
// Compliance doc (EH-C): one `ready` doc on the seed property so
// /admin/properties/[id]/compliance lists at least one row in real-backend
// mode. PDF rendering is async (pg-boss worker); seeding directly as
// `ready` with a stub URL lets list/detail UI render without booting
// the worker for every spec.
// ----------------------------------------------------------------------------
const SEED_COMPLIANCE_DOC = {
  id: mk('compliance-doc-seed-1'),
  propertyId: SEED_PROPERTY.id,
  workOrderIds: [SEED_WO_ID],
  includedSlotIds: [mk('slot-roofing')],
  signature: {
    signedByName: 'Drew Owens',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    signedAt: '2026-04-30T17:00:00.000Z',
  },
  jobId: null,
  status: 'ready',
  resultUrl: 'https://example.invalid/compliance/seed.pdf',
  error: null,
}

// ----------------------------------------------------------------------------
// Invoices (one per status + one overdue)
// ----------------------------------------------------------------------------
const INVOICES = [
  {
    id: mk('invoice-seed-draft'),
    invoiceNumber: 'INV-2026-0001',
    status: 'draft',
    issuedAt: null, sentAt: null, dueAt: NEAR_FUTURE_ISO, paidAt: null,
    paidAmountCents: 0,
    quoteId: SEED_QUOTE_ID,
    lineItems: [{ id: mk('inv-line-1'), kind: 'labor', description: 'Roof replacement — class A metal', quantity: 1, unitCostCents: 1850000 }],
    markupPercent: 0, taxPercent: 0, notes: null,
    totals: { subtotalCents: 1850000, markupCents: 0, taxCents: 0, totalCents: 1850000 },
  },
  {
    id: mk('invoice-seed-sent'),
    invoiceNumber: 'INV-2026-0002',
    status: 'sent',
    issuedAt: '2026-05-01T17:00:00.000Z', sentAt: '2026-05-01T17:00:00.000Z', dueAt: NEAR_FUTURE_ISO, paidAt: null,
    paidAmountCents: 0,
    quoteId: null,
    lineItems: [{ id: mk('inv-line-2'), kind: 'labor', description: 'Defensible-space clearing — zone 1', quantity: 8, unitCostCents: 12500 }],
    markupPercent: 10, taxPercent: 0, notes: null,
    totals: { subtotalCents: 100000, markupCents: 10000, taxCents: 0, totalCents: 110000 },
  },
  {
    id: mk('invoice-seed-overdue'),
    invoiceNumber: 'INV-2026-0003',
    status: 'sent',
    issuedAt: '2026-04-01T17:00:00.000Z', sentAt: '2026-04-01T17:00:00.000Z', dueAt: PAST_ISO, paidAt: null,
    paidAmountCents: 0,
    quoteId: null,
    lineItems: [{ id: mk('inv-line-3'), kind: 'material', description: 'Class-A metal roofing — Standing seam', quantity: 24, unitCostCents: 18000 }],
    markupPercent: 0, taxPercent: 0, notes: 'Past due. Followup email sent 2026-04-30.',
    totals: { subtotalCents: 432000, markupCents: 0, taxCents: 0, totalCents: 432000 },
  },
  {
    id: mk('invoice-seed-paid'),
    invoiceNumber: 'INV-2026-0004',
    status: 'paid',
    issuedAt: '2026-03-15T17:00:00.000Z', sentAt: '2026-03-15T17:00:00.000Z', dueAt: '2026-04-15T17:00:00.000Z', paidAt: '2026-04-10T17:00:00.000Z',
    paidAmountCents: 75000,
    quoteId: null,
    lineItems: [{ id: mk('inv-line-4'), kind: 'labor', description: 'Initial site assessment', quantity: 1, unitCostCents: 75000 }],
    markupPercent: 0, taxPercent: 0, notes: null,
    totals: { subtotalCents: 75000, markupCents: 0, taxCents: 0, totalCents: 75000 },
  },
]

// ============================================================================
// Apply
// ============================================================================
try {
  // Wipe domain rows owned by the demo orgs so re-running the seed produces
  // a deterministic state. Tests + manual exploration leave detritus; with
  // `BULWARK_BACKEND=real` and a single shared DB across workers, the only
  // safe baseline is "delete everything domain-shaped, then upsert". We
  // intentionally preserve users + memberships across the wipe so personas
  // in other orgs aren't affected and reset-victim's password gets restored
  // by the upsert below.
  const DEMO_ORG_IDS = [ORG_BULWARK.id, ORG_ACME.id]
  await sql`DELETE FROM compliance_docs WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM jobs WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM invoices WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM work_orders WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM quotes WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM assessments WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM properties WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM clients WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM subcontractors WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM api_keys WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM compliance_standards WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM audit_log WHERE organization_id = ANY(${DEMO_ORG_IDS})`

  // Orgs ---------------------------------------------------------------------
  for (const org of [ORG_BULWARK, ORG_ACME]) {
    await sql`
      INSERT INTO organizations (id, name, slug)
      VALUES (${org.id}, ${org.name}, ${org.slug})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    `
  }

  // Users + memberships ------------------------------------------------------
  for (const p of PERSONAS) {
    await sql`
      INSERT INTO users (id, email, full_name, password_hash, is_active)
      VALUES (${p.id}, ${p.email}, ${p.fullName}, ${passwordHash}, true)
      ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            password_hash = EXCLUDED.password_hash,
            is_active = true
    `
    for (const m of p.memberships) {
      await sql`
        INSERT INTO memberships (user_id, organization_id, role, is_active)
        VALUES (${p.id}, ${m.orgId}, ${m.role}, true)
        ON CONFLICT (user_id, organization_id) DO UPDATE
          SET role = EXCLUDED.role, is_active = true
      `
    }
  }

  // Clients ------------------------------------------------------------------
  for (const c of CLIENTS) {
    await sql`
      INSERT INTO clients (id, organization_id, full_name, email, phone, preferred_contact, notes)
      VALUES (${c.id}, ${ORG_BULWARK.id}, ${c.fullName}, ${c.email}, ${c.phone}, ${c.preferredContact}, ${c.notes})
      ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            preferred_contact = EXCLUDED.preferred_contact,
            notes = EXCLUDED.notes
    `
  }

  // Properties ---------------------------------------------------------------
  for (const p of PROPERTIES) {
    await sql`
      INSERT INTO properties (id, organization_id, address_line_1, city, state, postal_code, client_id, status)
      VALUES (${p.id}, ${ORG_BULWARK.id}, ${p.addressLine1}, ${p.city}, ${p.state}, ${p.postalCode}, ${p.clientId}, ${p.status})
      ON CONFLICT (id) DO UPDATE
        SET address_line_1 = EXCLUDED.address_line_1,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            postal_code = EXCLUDED.postal_code,
            client_id = EXCLUDED.client_id,
            status = EXCLUDED.status
    `
  }

  // Subcontractors -----------------------------------------------------------
  for (const s of SUBCONTRACTORS) {
    await sql`
      INSERT INTO subcontractors (id, organization_id, company_name, contact_name, email, phone, trades, license_number, license_expires_at, notes)
      VALUES (${s.id}, ${ORG_BULWARK.id}, ${s.companyName}, ${s.contactName}, ${s.email}, ${s.phone}, ${sql.json(s.trades)}, ${s.licenseNumber}, ${s.licenseExpiresAt}, ${s.notes})
      ON CONFLICT (id) DO UPDATE
        SET company_name = EXCLUDED.company_name,
            contact_name = EXCLUDED.contact_name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            trades = EXCLUDED.trades,
            license_number = EXCLUDED.license_number,
            license_expires_at = EXCLUDED.license_expires_at,
            notes = EXCLUDED.notes
    `
  }

  // Assessment ---------------------------------------------------------------
  await sql`
    INSERT INTO assessments (id, organization_id, property_id, assessed_by_id, assessed_at, roof_material, siding_material, eave_type, vent_type, defensible_space_cleared, notes)
    VALUES (${SEED_ASSESSMENT.id}, ${ORG_BULWARK.id}, ${SEED_ASSESSMENT.propertyId}, ${SEED_ASSESSMENT.assessedById}, ${SEED_ASSESSMENT.assessedAt}, ${SEED_ASSESSMENT.roofMaterial}, ${SEED_ASSESSMENT.sidingMaterial}, ${SEED_ASSESSMENT.eaveType}, ${SEED_ASSESSMENT.ventType}, ${SEED_ASSESSMENT.defensibleSpaceCleared}, ${SEED_ASSESSMENT.notes})
    ON CONFLICT (id) DO UPDATE
      SET assessed_at = EXCLUDED.assessed_at,
          roof_material = EXCLUDED.roof_material,
          siding_material = EXCLUDED.siding_material,
          eave_type = EXCLUDED.eave_type,
          vent_type = EXCLUDED.vent_type,
          defensible_space_cleared = EXCLUDED.defensible_space_cleared,
          notes = EXCLUDED.notes
  `

  // Quote --------------------------------------------------------------------
  await sql`
    INSERT INTO quotes (id, organization_id, property_id, assessment_id, created_by_id, quote_number, status, issued_at, sent_at, accepted_at, expires_at, line_items, markup_percent, tax_percent, notes, totals, total_cents)
    VALUES (${SEED_QUOTE.id}, ${ORG_BULWARK.id}, ${SEED_QUOTE.propertyId}, ${SEED_QUOTE.assessmentId}, ${SEED_QUOTE.createdById}, ${SEED_QUOTE.quoteNumber}, ${SEED_QUOTE.status}, ${SEED_QUOTE.issuedAt}, ${SEED_QUOTE.sentAt}, ${SEED_QUOTE.acceptedAt}, ${SEED_QUOTE.expiresAt}, ${sql.json(SEED_QUOTE.lineItems)}, ${SEED_QUOTE.markupPercent}, ${SEED_QUOTE.taxPercent}, ${SEED_QUOTE.notes}, ${sql.json(SEED_QUOTE.totals)}, ${SEED_QUOTE.totalCents})
    ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          issued_at = EXCLUDED.issued_at,
          sent_at = EXCLUDED.sent_at,
          accepted_at = EXCLUDED.accepted_at,
          expires_at = EXCLUDED.expires_at,
          line_items = EXCLUDED.line_items,
          markup_percent = EXCLUDED.markup_percent,
          tax_percent = EXCLUDED.tax_percent,
          notes = EXCLUDED.notes,
          totals = EXCLUDED.totals,
          total_cents = EXCLUDED.total_cents
  `

  // Work order ---------------------------------------------------------------
  await sql`
    INSERT INTO work_orders (id, organization_id, property_id, quote_id, work_order_number, status, scheduled_start, scheduled_end, trade_slots, materials, notes, created_by_id)
    VALUES (${SEED_WO.id}, ${ORG_BULWARK.id}, ${SEED_WO.propertyId}, ${SEED_WO.quoteId}, ${SEED_WO.workOrderNumber}, ${SEED_WO.status}, ${SEED_WO.scheduledStart}, ${SEED_WO.scheduledEnd}, ${sql.json(SEED_WO.tradeSlots)}, ${sql.json(SEED_WO.materials)}, ${SEED_WO.notes}, ${SEED_WO.createdById})
    ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          scheduled_start = EXCLUDED.scheduled_start,
          scheduled_end = EXCLUDED.scheduled_end,
          trade_slots = EXCLUDED.trade_slots,
          materials = EXCLUDED.materials,
          notes = EXCLUDED.notes
  `

  // Invoices -----------------------------------------------------------------
  for (const inv of INVOICES) {
    await sql`
      INSERT INTO invoices (id, organization_id, property_id, work_order_id, quote_id, invoice_number, status, issued_at, sent_at, due_at, paid_at, paid_amount_cents, line_items, markup_percent, tax_percent, notes, totals, total_cents)
      VALUES (${inv.id}, ${ORG_BULWARK.id}, ${SEED_PROPERTY.id}, ${SEED_WO_ID}, ${inv.quoteId}, ${inv.invoiceNumber}, ${inv.status}, ${inv.issuedAt}, ${inv.sentAt}, ${inv.dueAt}, ${inv.paidAt}, ${inv.paidAmountCents}, ${sql.json(inv.lineItems)}, ${inv.markupPercent}, ${inv.taxPercent}, ${inv.notes}, ${sql.json(inv.totals)}, ${inv.totals.totalCents})
      ON CONFLICT (id) DO UPDATE
        SET status = EXCLUDED.status,
            issued_at = EXCLUDED.issued_at,
            sent_at = EXCLUDED.sent_at,
            due_at = EXCLUDED.due_at,
            paid_at = EXCLUDED.paid_at,
            paid_amount_cents = EXCLUDED.paid_amount_cents,
            line_items = EXCLUDED.line_items,
            markup_percent = EXCLUDED.markup_percent,
            tax_percent = EXCLUDED.tax_percent,
            notes = EXCLUDED.notes,
            totals = EXCLUDED.totals,
            total_cents = EXCLUDED.total_cents
    `
  }

  // Compliance doc -----------------------------------------------------------
  await sql`
    INSERT INTO compliance_docs (id, organization_id, property_id, work_order_ids, included_slot_ids, signature, job_id, status, result_url, error)
    VALUES (${SEED_COMPLIANCE_DOC.id}, ${ORG_BULWARK.id}, ${SEED_COMPLIANCE_DOC.propertyId}, ${sql.json(SEED_COMPLIANCE_DOC.workOrderIds)}, ${sql.json(SEED_COMPLIANCE_DOC.includedSlotIds)}, ${sql.json(SEED_COMPLIANCE_DOC.signature)}, ${SEED_COMPLIANCE_DOC.jobId}, ${SEED_COMPLIANCE_DOC.status}, ${SEED_COMPLIANCE_DOC.resultUrl}, ${SEED_COMPLIANCE_DOC.error})
    ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          work_order_ids = EXCLUDED.work_order_ids,
          included_slot_ids = EXCLUDED.included_slot_ids,
          signature = EXCLUDED.signature,
          result_url = EXCLUDED.result_url,
          error = EXCLUDED.error
  `

  // Programs (Wave 1A / EH-A / ADR-0013) ------------------------------------
  // One seeded "Wildfire Retrofit" inspection program per demo org. Built-in
  // (cannot be hard-deleted via the service) so e2e specs can rely on it
  // existing during e2e specs. Custom programs created by tests should
  // start fresh — wipe + ON CONFLICT keeps re-runs idempotent.
  await sql`DELETE FROM program_memberships WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM programs WHERE organization_id = ANY(${DEMO_ORG_IDS})`

  const WILDFIRE_TRADE_SLOTS = [
    { tradeSlug: 'roofing', quantity: 1 },
    { tradeSlug: 'gutters', quantity: 1 },
    { tradeSlug: 'vegetation', quantity: 1 },
    { tradeSlug: 'venting', quantity: 1 },
  ]
  const WILDFIRE_PRICING = { markupBps: 1500, taxBps: 0, quoteExpiryDays: 30 }

  for (const org of [ORG_BULWARK, ORG_ACME]) {
    const programId = mk(`program-wildfire-retrofit-${org.slug}`)
    await sql`
      INSERT INTO programs (
        id, organization_id, slug, name, kind, description, color, icon,
        is_builtin, is_active, sort_order,
        default_trade_slots, pricing_defaults
      )
      VALUES (
        ${programId}, ${org.id}, 'wildfire-retrofit', 'Wildfire Retrofit',
        'inspection_program',
        'WUI assessment + Class A roof / 1/8" mesh vents / 5ft ember-resistant zone retrofit program.',
        '#FF6B35', 'flame',
        true, true, 0,
        ${sql.json(WILDFIRE_TRADE_SLOTS)}, ${sql.json(WILDFIRE_PRICING)}
      )
      ON CONFLICT (organization_id, slug) DO UPDATE
        SET name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            description = EXCLUDED.description,
            color = EXCLUDED.color,
            icon = EXCLUDED.icon,
            is_builtin = EXCLUDED.is_builtin,
            is_active = EXCLUDED.is_active,
            sort_order = EXCLUDED.sort_order,
            default_trade_slots = EXCLUDED.default_trade_slots,
            pricing_defaults = EXCLUDED.pricing_defaults
    `
  }

  // Inspection templates (Wave 2 / EH-F / W2-2 / ADR-0019) -------------------
  // Bootstrap the built-in wildfire inspection template per demo org and
  // link it back to the wildfire program. We redeclare the section + field
  // shape here as plain JS (rather than importing the TS source) because
  // this seed script runs under plain node, not tsx. Tests verify that the
  // slugs + rule kinds stay in sync with `shared/inspection-templates/
  // wildfire-defaults.ts`; if you change one, change the other.
  const WILDFIRE_TEMPLATE_SEED = {
    slug: 'wildfire-retrofit',
    name: 'Wildfire retrofit inspection',
    description: 'Built-in WUI-zone inspection used by the wildfire retrofit program.',
    sections: [
      {
        slug: 'zone_0',
        name: 'Zone 0 — Ember resistant (0–5 ft)',
        fields: [
          { slug: 'defensible_space_cleared', label: 'Zone 0 cleared of combustibles', kind: 'boolean', required: true,
            evaluatorRule: { kind: 'must_be_true', severity: 'error', standardRef: 'OAR 629-044-1080' } },
          { slug: 'mulch_present', label: 'Combustible mulch present', kind: 'boolean',
            evaluatorRule: { kind: 'must_be_false', severity: 'error' } },
          { slug: 'zone_0_notes', label: 'Notes', kind: 'longtext' },
          { slug: 'zone_0_photos', label: 'Photos', kind: 'photo' },
        ],
      },
      {
        slug: 'zone_1',
        name: 'Zone 1 — Lean, clean, green (5–30 ft)',
        fields: [
          { slug: 'tree_spacing_ft', label: 'Min tree spacing (ft)', kind: 'number',
            evaluatorRule: { kind: 'min', value: 10, severity: 'error' } },
          { slug: 'ladder_fuels_present', label: 'Ladder fuels present', kind: 'boolean',
            evaluatorRule: { kind: 'must_be_false', severity: 'error' } },
          { slug: 'zone_1_notes', label: 'Notes', kind: 'longtext' },
        ],
      },
      {
        slug: 'zone_2',
        name: 'Zone 2 — Reduced fuel (30–100 ft)',
        fields: [
          { slug: 'tree_canopy_continuous', label: 'Continuous canopy', kind: 'boolean',
            evaluatorRule: { kind: 'must_be_false', severity: 'warning' } },
          { slug: 'dead_fuel_load', label: 'Dead fuel load (1=light, 5=heavy)', kind: 'rating',
            evaluatorRule: { kind: 'max', value: 2, severity: 'warning' } },
        ],
      },
      {
        slug: 'roof',
        name: 'Roof',
        fields: [
          { slug: 'roof_material', label: 'Roof material', kind: 'select', required: true,
            options: [
              { value: 'metal', label: 'Metal' },
              { value: 'tile', label: 'Tile' },
              { value: 'class_a_asphalt', label: 'Class A asphalt' },
              { value: 'wood_shake', label: 'Wood shake' },
              { value: 'other', label: 'Other' },
            ],
            evaluatorRule: { kind: 'must_be_one_of', values: ['metal', 'tile', 'class_a_asphalt'],
              severity: 'error', standardRef: 'OAR 629-044-1030' } },
          { slug: 'roof_condition', label: 'Condition (1=poor, 5=excellent)', kind: 'rating' },
          { slug: 'gutters_clean', label: 'Gutters clear of debris', kind: 'boolean',
            evaluatorRule: { kind: 'must_be_true', severity: 'warning' } },
        ],
      },
      {
        slug: 'vents',
        name: 'Vents',
        fields: [
          { slug: 'vent_type', label: 'Vent type', kind: 'select', required: true,
            options: [
              { value: 'ember_resistant', label: 'Ember-resistant (1/8" mesh)' },
              { value: 'standard_screen', label: 'Standard screen' },
              { value: 'open', label: 'Open / unscreened' },
            ],
            evaluatorRule: { kind: 'must_be_one_of', values: ['ember_resistant'],
              severity: 'error', standardRef: 'OAR 629-044-1060' } },
          { slug: 'vent_count', label: 'Vent count', kind: 'number' },
        ],
      },
      {
        slug: 'eaves',
        name: 'Eaves',
        fields: [
          { slug: 'eave_type', label: 'Eave type', kind: 'select', required: true,
            options: [
              { value: 'enclosed', label: 'Enclosed' },
              { value: 'boxed', label: 'Boxed' },
              { value: 'open', label: 'Open' },
            ],
            evaluatorRule: { kind: 'must_be_one_of', values: ['enclosed', 'boxed'],
              severity: 'error', standardRef: 'OAR 629-044-1050' } },
          { slug: 'soffit_material', label: 'Soffit material', kind: 'text' },
        ],
      },
      {
        slug: 'siding',
        name: 'Siding',
        fields: [
          { slug: 'siding_material', label: 'Siding material', kind: 'select', required: true,
            options: [
              { value: 'fiber_cement', label: 'Fiber cement' },
              { value: 'stucco', label: 'Stucco' },
              { value: 'metal', label: 'Metal' },
              { value: 'masonry', label: 'Masonry' },
              { value: 'brick', label: 'Brick' },
              { value: 'vinyl', label: 'Vinyl' },
              { value: 'wood', label: 'Wood' },
            ],
            evaluatorRule: { kind: 'must_be_one_of',
              values: ['fiber_cement', 'stucco', 'metal', 'masonry', 'brick'],
              severity: 'error', standardRef: 'OAR 629-044-1040' } },
          { slug: 'clearance_to_grade_in', label: 'Clearance to grade (in)', kind: 'number',
            evaluatorRule: { kind: 'min', value: 6, severity: 'warning' } },
        ],
      },
      {
        slug: 'deck',
        name: 'Decks',
        isRepeatable: true,
        repeatableLabel: 'deck',
        fields: [
          { slug: 'deck_material', label: 'Deck material', kind: 'select', required: true,
            options: [
              { value: 'composite', label: 'Composite' },
              { value: 'metal', label: 'Metal' },
              { value: 'ignition_resistant_wood', label: 'Ignition-resistant wood' },
              { value: 'untreated_wood', label: 'Untreated wood' },
            ] },
          { slug: 'deck_storage_beneath', label: 'Combustible storage under deck', kind: 'boolean',
            evaluatorRule: { kind: 'must_be_false', severity: 'error' } },
        ],
      },
    ],
  }

  await sql`DELETE FROM inspection_responses WHERE inspection_id IN (
    SELECT id FROM inspections WHERE organization_id = ANY(${DEMO_ORG_IDS})
  )`
  await sql`DELETE FROM inspections WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  await sql`DELETE FROM inspection_template_fields WHERE section_id IN (
    SELECT s.id FROM inspection_template_sections s
    JOIN inspection_templates t ON t.id = s.template_id
    WHERE t.organization_id = ANY(${DEMO_ORG_IDS})
  )`
  await sql`DELETE FROM inspection_template_sections WHERE template_id IN (
    SELECT id FROM inspection_templates WHERE organization_id = ANY(${DEMO_ORG_IDS})
  )`
  await sql`DELETE FROM inspection_templates WHERE organization_id = ANY(${DEMO_ORG_IDS})`

  for (const org of [ORG_BULWARK, ORG_ACME]) {
    const templateId = mk(`inspection-template-wildfire-${org.slug}`)
    const programId = mk(`program-wildfire-retrofit-${org.slug}`)
    await sql`
      INSERT INTO inspection_templates (
        id, organization_id, program_id, slug, name, description,
        version, is_active, is_builtin
      ) VALUES (
        ${templateId}, ${org.id}, ${programId},
        ${WILDFIRE_TEMPLATE_SEED.slug}, ${WILDFIRE_TEMPLATE_SEED.name},
        ${WILDFIRE_TEMPLATE_SEED.description},
        1, true, true
      )
    `
    for (let sIdx = 0; sIdx < WILDFIRE_TEMPLATE_SEED.sections.length; sIdx++) {
      const s = WILDFIRE_TEMPLATE_SEED.sections[sIdx]
      const sectionId = mk(`inspection-section-${s.slug}-${org.slug}`)
      await sql`
        INSERT INTO inspection_template_sections (
          id, template_id, slug, name, sort_order, is_repeatable, repeatable_label
        ) VALUES (
          ${sectionId}, ${templateId}, ${s.slug}, ${s.name}, ${sIdx},
          ${s.isRepeatable ?? false}, ${s.repeatableLabel ?? null}
        )
      `
      for (let fIdx = 0; fIdx < s.fields.length; fIdx++) {
        const f = s.fields[fIdx]
        const fieldId = mk(`inspection-field-${s.slug}-${f.slug}-${org.slug}`)
        await sql`
          INSERT INTO inspection_template_fields (
            id, section_id, slug, label, kind, options, required, sort_order, evaluator_rule
          ) VALUES (
            ${fieldId}, ${sectionId}, ${f.slug}, ${f.label}, ${f.kind},
            ${f.options ? sql.json(f.options) : null},
            ${f.required ?? false},
            ${fIdx},
            ${f.evaluatorRule ? sql.json(f.evaluatorRule) : null}
          )
        `
      }
    }
    await sql`
      UPDATE programs SET inspection_template_id = ${templateId}
      WHERE id = ${programId}
    `
  }

  // Trades + Status pipelines + Org settings (Wave 1B / EH-H / W1-3) ---------
  // Per-org built-in trades. Slugs match the Zod TradeSchema enum.
  await sql`DELETE FROM trades WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  const BUILTIN_TRADES_SEED = [
    { slug: 'roofing', name: 'Roofing', color: '#B45309', sortOrder: 10 },
    { slug: 'siding', name: 'Siding', color: '#0E7490', sortOrder: 20 },
    { slug: 'gutters', name: 'Gutters', color: '#475569', sortOrder: 30 },
    { slug: 'eaves_vents', name: 'Eaves & vents', color: '#7C3AED', sortOrder: 40 },
    { slug: 'defensible_space', name: 'Defensible space', color: '#15803D', sortOrder: 50 },
    { slug: 'general_labor', name: 'General labor', color: '#1F2937', sortOrder: 60 },
  ]
  for (const org of [ORG_BULWARK, ORG_ACME]) {
    for (const t of BUILTIN_TRADES_SEED) {
      const id = mk(`trade-${t.slug}-${org.slug}`)
      await sql`
        INSERT INTO trades (
          id, organization_id, slug, name, color, sort_order, is_builtin, is_active
        )
        VALUES (
          ${id}, ${org.id}, ${t.slug}, ${t.name}, ${t.color}, ${t.sortOrder}, true, true
        )
        ON CONFLICT (organization_id, slug) DO UPDATE
          SET name = EXCLUDED.name,
              color = EXCLUDED.color,
              sort_order = EXCLUDED.sort_order,
              is_builtin = EXCLUDED.is_builtin,
              is_active = EXCLUDED.is_active
      `
    }
  }

  // Default status pipelines per org per entity type. The shape mirrors
  // shared/pipelines/defaults.ts; we redeclare here in plain SQL to keep
  // the seed script free of Nuxt-resolved imports.
  await sql`DELETE FROM status_pipeline_nodes
            WHERE pipeline_id IN (
              SELECT id FROM status_pipelines WHERE organization_id = ANY(${DEMO_ORG_IDS})
            )`
  await sql`DELETE FROM status_pipelines WHERE organization_id = ANY(${DEMO_ORG_IDS})`
  const DEFAULT_PIPELINES_SEED = {
    property: [
      { slug: 'lead', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['scheduled', 'on_hold', 'cancelled'] },
      { slug: 'scheduled', color: '#0EA5E9', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['assessed', 'on_hold', 'cancelled'] },
      { slug: 'assessed', color: '#6366F1', sortOrder: 30, isInitial: false, isTerminal: false, allowedTransitions: ['quoted', 'on_hold', 'cancelled'] },
      { slug: 'quoted', color: '#A855F7', sortOrder: 40, isInitial: false, isTerminal: false, allowedTransitions: ['accepted', 'on_hold', 'cancelled'] },
      { slug: 'accepted', color: '#22C55E', sortOrder: 50, isInitial: false, isTerminal: false, allowedTransitions: ['in_progress', 'on_hold', 'cancelled'] },
      { slug: 'in_progress', color: '#F59E0B', sortOrder: 60, isInitial: false, isTerminal: false, allowedTransitions: ['completed', 'on_hold', 'cancelled'] },
      { slug: 'completed', color: '#10B981', sortOrder: 70, isInitial: false, isTerminal: false, allowedTransitions: ['compliance_pending', 'invoiced'] },
      { slug: 'compliance_pending', color: '#EAB308', sortOrder: 80, isInitial: false, isTerminal: false, allowedTransitions: ['compliance_complete', 'on_hold'] },
      { slug: 'compliance_complete', color: '#059669', sortOrder: 90, isInitial: false, isTerminal: false, allowedTransitions: ['invoiced'] },
      { slug: 'invoiced', color: '#0284C7', sortOrder: 100, isInitial: false, isTerminal: false, allowedTransitions: ['paid'] },
      { slug: 'paid', color: '#16A34A', sortOrder: 110, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'on_hold', color: '#EF4444', sortOrder: 120, isInitial: false, isTerminal: false, allowedTransitions: ['scheduled', 'in_progress', 'cancelled'] },
      { slug: 'cancelled', color: '#64748B', sortOrder: 130, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
    quote: [
      { slug: 'draft', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['sent'] },
      { slug: 'sent', color: '#0EA5E9', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['accepted', 'rejected', 'expired'] },
      { slug: 'accepted', color: '#22C55E', sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'rejected', color: '#EF4444', sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'expired', color: '#64748B', sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
    work_order: [
      { slug: 'draft', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['scheduled', 'cancelled'] },
      { slug: 'scheduled', color: '#0EA5E9', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['in_progress', 'cancelled'] },
      { slug: 'in_progress', color: '#F59E0B', sortOrder: 30, isInitial: false, isTerminal: false, allowedTransitions: ['completed', 'cancelled'] },
      { slug: 'completed', color: '#10B981', sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'cancelled', color: '#64748B', sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
    invoice: [
      { slug: 'draft', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['sent'] },
      { slug: 'sent', color: '#0EA5E9', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['paid'] },
      { slug: 'paid', color: '#16A34A', sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
    compliance: [
      { slug: 'draft', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['generating', 'cancelled'] },
      { slug: 'generating', color: '#F59E0B', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['ready', 'failed'] },
      { slug: 'ready', color: '#10B981', sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'failed', color: '#EF4444', sortOrder: 40, isInitial: false, isTerminal: false, allowedTransitions: ['generating', 'cancelled'] },
      { slug: 'cancelled', color: '#64748B', sortOrder: 50, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
    job: [
      { slug: 'queued', color: '#94A3B8', sortOrder: 10, isInitial: true, isTerminal: false, allowedTransitions: ['running'] },
      { slug: 'running', color: '#F59E0B', sortOrder: 20, isInitial: false, isTerminal: false, allowedTransitions: ['succeeded', 'failed'] },
      { slug: 'succeeded', color: '#10B981', sortOrder: 30, isInitial: false, isTerminal: true, allowedTransitions: [] },
      { slug: 'failed', color: '#EF4444', sortOrder: 40, isInitial: false, isTerminal: true, allowedTransitions: [] },
    ],
  }
  for (const org of [ORG_BULWARK, ORG_ACME]) {
    for (const [entityType, nodes] of Object.entries(DEFAULT_PIPELINES_SEED)) {
      const pipelineId = mk(`pipeline-${entityType}-${org.slug}`)
      await sql`
        INSERT INTO status_pipelines (id, organization_id, entity_type, version, is_active)
        VALUES (${pipelineId}, ${org.id}, ${entityType}, 1, true)
        ON CONFLICT (organization_id, entity_type, version) DO UPDATE
          SET is_active = EXCLUDED.is_active
      `
      for (const n of nodes) {
        const nodeId = mk(`pipeline-node-${entityType}-${n.slug}-${org.slug}`)
        await sql`
          INSERT INTO status_pipeline_nodes (
            id, pipeline_id, slug, label_key, color, sort_order,
            is_initial, is_terminal, allowed_transitions
          )
          VALUES (
            ${nodeId}, ${pipelineId}, ${n.slug},
            ${`status.${entityType}.${n.slug}`}, ${n.color}, ${n.sortOrder},
            ${n.isInitial}, ${n.isTerminal}, ${sql.json(n.allowedTransitions)}
          )
          ON CONFLICT (pipeline_id, slug) DO UPDATE
            SET label_key = EXCLUDED.label_key,
                color = EXCLUDED.color,
                sort_order = EXCLUDED.sort_order,
                is_initial = EXCLUDED.is_initial,
                is_terminal = EXCLUDED.is_terminal,
                allowed_transitions = EXCLUDED.allowed_transitions
        `
      }
    }
  }

  // Singleton org_settings row per org. Defaults are baked into the table
  // columns; we INSERT with explicit values for clarity + future overrides.
  for (const org of [ORG_BULWARK, ORG_ACME]) {
    const id = mk(`org-settings-${org.slug}`)
    await sql`
      INSERT INTO org_settings (
        id, organization_id, quote_number_format, wo_number_format, invoice_number_format,
        default_markup_bps, default_tax_bps,
        default_quote_expiry_days, default_invoice_terms_days,
        default_sla_days_assessment, default_sla_days_quote
      )
      VALUES (
        ${id}, ${org.id},
        'Q-{year}-{seq:04}', 'WO-{year}-{seq:04}', 'INV-{year}-{seq:04}',
        1500, 0, 30, 30, 7, 3
      )
      ON CONFLICT (organization_id) DO NOTHING
    `
  }

  console.log(`Seeded ${PERSONAS.length} users across 2 orgs.`)
  console.log(`Seeded ${CLIENTS.length} clients, ${PROPERTIES.length} properties, ${SUBCONTRACTORS.length} subcontractors.`)
  console.log(`Seeded 1 assessment, 1 quote, 1 work order, ${INVOICES.length} invoices, 1 compliance doc.`)
  console.log(`Seeded 1 built-in program (Wildfire Retrofit) per demo org.`)
  console.log(`Seeded 6 built-in trades, 6 default pipelines, and 1 org_settings row per demo org.`)
  console.log(`Demo password (all personas): ${DEMO_PASSWORD}`)
} finally {
  await sql.end()
}
