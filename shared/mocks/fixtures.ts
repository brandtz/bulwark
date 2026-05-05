/**
 * shared/mocks/fixtures.ts — deterministic seed data shared across all mocks.
 *
 * Decisions:
 *   - Deterministic UUIDs (the `mk()` helper) so spec assertions can reference
 *     them stably across runs.
 *   - One demo org, three users (admin/field/sub), 12+ properties spanning
 *     every PropertyStatus so the pipeline kanban has at least one card per
 *     column on first paint.
 *
 * Decisions NOT taken:
 *   - We don't randomize fixtures with faker. Determinism > variety for an
 *     agent-driven build — flaky tests are far more painful than monotonous
 *     seed data.
 */
import type { Property, PropertyStatus } from '../contracts/property'
import type { Client } from '../contracts/client'
import type { SessionUser } from '../contracts/auth'
import type { Subcontractor } from '../contracts/subcontractor'
import type { WorkOrder } from '../contracts/work-order'
import type { Invoice } from '../contracts/invoice'
/** Build a deterministic UUID from a slug. */
const mk = (slug: string): string => {
  // Pad/truncate the slug to 32 hex-ish chars and shape into UUID form.
  const hex = (slug.replace(/[^a-z0-9]/gi, '') + '00000000000000000000000000000000').slice(0, 32)
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`
}

const NOW = '2026-05-03T20:00:00.000Z'

// ----------------------------------------------------------------------------
// Org + users
// ----------------------------------------------------------------------------
export const FIXTURE_ORG_ID = mk('org-bulwark-demo')
// E2-S4: a second org so the org switcher actually has somewhere to switch
// to. Real prod will of course have arbitrarily many.
export const FIXTURE_ORG_ID_2 = mk('org-acme-restoration')
export const FIXTURE_ORG_2_NAME = 'Acme Restoration LLC'

export const FIXTURE_USER_ADMIN: SessionUser = {
  userId: mk('user-drew-admin'),
  email: 'drew@bulwark.demo',
  fullName: 'Drew Owens',
  avatarUrl: null,
  activeOrganizationId: FIXTURE_ORG_ID,
  activeRole: 'org_admin',
  memberships: [
    { organizationId: FIXTURE_ORG_ID, organizationName: 'Bulwark Demo Co.', role: 'org_admin' },
  ],
}

export const FIXTURE_USER_FIELD: SessionUser = {
  userId: mk('user-matthew-field'),
  email: 'matthew@bulwark.demo',
  fullName: 'Matthew Reyes',
  avatarUrl: null,
  activeOrganizationId: FIXTURE_ORG_ID,
  activeRole: 'field',
  memberships: [
    { organizationId: FIXTURE_ORG_ID, organizationName: 'Bulwark Demo Co.', role: 'field' },
  ],
}

export const FIXTURE_USER_SUB: SessionUser = {
  userId: mk('user-jeff-sub'),
  email: 'jeff@bulwark.demo',
  fullName: 'Jeff Park',
  avatarUrl: null,
  activeOrganizationId: FIXTURE_ORG_ID,
  activeRole: 'sub_contractor',
  memberships: [
    { organizationId: FIXTURE_ORG_ID, organizationName: 'Bulwark Demo Co.', role: 'sub_contractor' },
  ],
}

// E2-S4: a super_admin with memberships in BOTH orgs — the only persona
// for which the org-switcher widget is actually meaningful in the demo.
export const FIXTURE_USER_SUPER: SessionUser = {
  userId: mk('user-sasha-super'),
  email: 'sasha@bulwark.platform',
  fullName: 'Sasha Liu',
  avatarUrl: null,
  activeOrganizationId: FIXTURE_ORG_ID,
  activeRole: 'super_admin',
  memberships: [
    { organizationId: FIXTURE_ORG_ID, organizationName: 'Bulwark Demo Co.', role: 'super_admin' },
    { organizationId: FIXTURE_ORG_ID_2, organizationName: FIXTURE_ORG_2_NAME, role: 'super_admin' },
  ],
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------
export const FIXTURE_CLIENTS: Client[] = [
  { id: mk('client-1'), organizationId: FIXTURE_ORG_ID, fullName: 'Sandra Mitchell', email: 'sandra@example.com', phone: '+1-555-0101', preferredContact: 'phone', notes: 'Prefers afternoon visits.', createdAt: NOW, updatedAt: NOW, deletedAt: null },
  { id: mk('client-2'), organizationId: FIXTURE_ORG_ID, fullName: 'Robert & Lisa Tan', email: 'rtan@example.com', phone: '+1-555-0102', preferredContact: 'email', notes: null, createdAt: NOW, updatedAt: NOW, deletedAt: null },
  { id: mk('client-3'), organizationId: FIXTURE_ORG_ID, fullName: 'Hector Alvarez', email: null, phone: '+1-555-0103', preferredContact: 'phone', notes: 'Spanish preferred.', createdAt: NOW, updatedAt: NOW, deletedAt: null },
  { id: mk('client-4'), organizationId: FIXTURE_ORG_ID, fullName: 'Patricia Whitfield', email: 'pwhit@example.com', phone: '+1-555-0104', preferredContact: 'email', notes: null, createdAt: NOW, updatedAt: NOW, deletedAt: null },
  { id: mk('client-5'), organizationId: FIXTURE_ORG_ID, fullName: 'Marcus Henderson', email: 'mh@example.com', phone: '+1-555-0105', preferredContact: 'sms', notes: null, createdAt: NOW, updatedAt: NOW, deletedAt: null },
]

// ----------------------------------------------------------------------------
// Properties — at least one per PropertyStatus so /admin/pipeline kanban shows
// every column populated on first paint (E3-S1).
// ----------------------------------------------------------------------------
const propertySeed: Array<[string, PropertyStatus, string, string]> = [
  ['1428 Hillcrest Ave',   'lead',                 'Oakland',     'CA'],
  ['872 Skyline Blvd',     'scheduled',            'Berkeley',    'CA'],
  ['355 Grizzly Peak',     'assessed',             'Oakland',     'CA'],
  ['9011 Pinehurst Rd',    'quoted',               'Orinda',      'CA'],
  ['244 Vista Drive',      'accepted',             'Lafayette',   'CA'],
  ['612 Ridgemont Way',    'in_progress',          'Moraga',      'CA'],
  ['1801 Sunset Trail',    'completed',            'Walnut Creek','CA'],
  ['77 Oakhill Court',     'compliance_pending',   'Pleasant Hill','CA'],
  ['338 Coyote Hills',     'compliance_complete',  'Fremont',     'CA'],
  ['915 Eagle Ridge',      'invoiced',             'Concord',     'CA'],
  ['200 Foothill Blvd',    'paid',                 'Oakland',     'CA'],
  ['456 Forest View',      'on_hold',              'Berkeley',    'CA'],
  ['1290 Canyon Heights',  'in_progress',          'Moraga',      'CA'],
]

export const FIXTURE_PROPERTIES: Property[] = propertySeed.map(([line1, status, city, state], i) => ({
  id: mk(`property-${i + 1}`),
  organizationId: FIXTURE_ORG_ID,
  addressLine1: line1,
  addressLine2: null,
  city,
  state,
  postalCode: '94' + String(500 + i).padStart(3, '0'),
  clientId: FIXTURE_CLIENTS[i % FIXTURE_CLIENTS.length]!.id,
  status,
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
}))

// ----------------------------------------------------------------------------
// Subcontractors (E6).
// ----------------------------------------------------------------------------
export const FIXTURE_SUBCONTRACTORS: Subcontractor[] = [
  {
    id: mk('sub-roof-king'),
    organizationId: FIXTURE_ORG_ID,
    companyName: 'Roof King Co.',
    contactName: 'Mateo Ruiz',
    email: 'mateo@roofking.test',
    phone: '+1-555-0201',
    trades: ['roofing', 'gutters'],
    licenseNumber: 'CCB-228114',
    licenseExpiresAt: '2027-04-30T00:00:00.000Z',
    notes: 'Preferred metal-roof partner.',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
  {
    id: mk('sub-cascade-siding'),
    organizationId: FIXTURE_ORG_ID,
    companyName: 'Cascade Siding LLC',
    contactName: 'Priya Shah',
    email: 'priya@cascadesiding.test',
    phone: '+1-555-0202',
    trades: ['siding', 'eaves_vents'],
    licenseNumber: 'CCB-118842',
    licenseExpiresAt: '2026-12-15T00:00:00.000Z',
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
  {
    id: mk('sub-firebreak-clearing'),
    organizationId: FIXTURE_ORG_ID,
    companyName: 'Firebreak Clearing',
    contactName: 'Jordan Wells',
    email: null,
    phone: '+1-555-0203',
    trades: ['defensible_space', 'general_labor'],
    licenseNumber: null,
    licenseExpiresAt: null,
    notes: 'No CCB \u2014 unlicensed labor only.',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
]

// ----------------------------------------------------------------------------
// Seed work order (E6-S1) so the detail page has something to render on
// first paint, before any client-side WO is built. Bound to the
// `accepted` property so the demo flow lines up.
// ----------------------------------------------------------------------------
const SEED_PROPERTY = FIXTURE_PROPERTIES.find((p) => p.status === 'accepted')!
const SEED_QUOTE_ID = mk('quote-seed')

export const FIXTURE_WORK_ORDERS: WorkOrder[] = [
  {
    id: mk('wo-seed-1'),
    organizationId: FIXTURE_ORG_ID,
    propertyId: SEED_PROPERTY.id,
    quoteId: SEED_QUOTE_ID,
    workOrderNumber: 'WO-2026-0001',
    status: 'scheduled',
    scheduledStart: '2026-05-12T15:00:00.000Z',
    scheduledEnd: '2026-05-15T23:00:00.000Z',
    tradeSlots: [
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
    ],
    materials: [
      {
        id: mk('mat-metal-panels'),
        name: 'Steel roof panels (charcoal)',
        quantity: 28,
        unit: 'panel',
        unitCostCents: 6500,
      },
      {
        id: mk('mat-underlayment'),
        name: 'Synthetic underlayment',
        quantity: 6,
        unit: 'roll',
        unitCostCents: 8200,
      },
    ],
    notes: 'Customer requested early-morning starts; access via side gate.',
    createdById: FIXTURE_USER_ADMIN.userId,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
]

// ----------------------------------------------------------------------------
// Invoices (E8). One per persisted status + one overdue (sent + dueAt past).
// ----------------------------------------------------------------------------
const SEED_WO_ID = FIXTURE_WORK_ORDERS[0]!.id
const PAST_ISO = '2026-04-15T17:00:00.000Z'    // before NOW
const NEAR_FUTURE_ISO = '2026-05-30T17:00:00.000Z'

export const FIXTURE_INVOICES: Invoice[] = [
  {
    id: mk('invoice-seed-draft'),
    organizationId: FIXTURE_ORG_ID,
    propertyId: SEED_PROPERTY.id,
    workOrderId: SEED_WO_ID,
    quoteId: SEED_QUOTE_ID,
    invoiceNumber: 'INV-2026-0001',
    status: 'draft',
    issuedAt: null,
    sentAt: null,
    dueAt: NEAR_FUTURE_ISO,
    paidAt: null,
    paidAmountCents: 0,
    lineItems: [
      {
        id: mk('inv-line-1'),
        kind: 'labor',
        description: 'Roof replacement \u2014 class A metal',
        quantity: 1,
        unitCostCents: 1850000,
      },
    ],
    markupPercent: 0,
    taxPercent: 0,
    notes: null,
    totals: {
      subtotalCents: 1850000,
      markupCents: 0,
      taxCents: 0,
      totalCents: 1850000,
    },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
  {
    id: mk('invoice-seed-sent'),
    organizationId: FIXTURE_ORG_ID,
    propertyId: SEED_PROPERTY.id,
    workOrderId: SEED_WO_ID,
    quoteId: null,
    invoiceNumber: 'INV-2026-0002',
    status: 'sent',
    issuedAt: '2026-05-01T17:00:00.000Z',
    sentAt: '2026-05-01T17:00:00.000Z',
    dueAt: NEAR_FUTURE_ISO,
    paidAt: null,
    paidAmountCents: 0,
    lineItems: [
      {
        id: mk('inv-line-2'),
        kind: 'labor',
        description: 'Defensible-space clearing \u2014 zone 1',
        quantity: 8,
        unitCostCents: 12500,
      },
    ],
    markupPercent: 10,
    taxPercent: 0,
    notes: null,
    totals: {
      subtotalCents: 100000,
      markupCents: 10000,
      taxCents: 0,
      totalCents: 110000,
    },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
  {
    id: mk('invoice-seed-overdue'),
    organizationId: FIXTURE_ORG_ID,
    propertyId: SEED_PROPERTY.id,
    workOrderId: SEED_WO_ID,
    quoteId: null,
    invoiceNumber: 'INV-2026-0003',
    status: 'sent',
    issuedAt: '2026-04-01T17:00:00.000Z',
    sentAt: '2026-04-01T17:00:00.000Z',
    dueAt: PAST_ISO,
    paidAt: null,
    paidAmountCents: 0,
    lineItems: [
      {
        id: mk('inv-line-3'),
        kind: 'material',
        description: 'Class-A metal roofing \u2014 Standing seam',
        quantity: 24,
        unitCostCents: 18000,
      },
    ],
    markupPercent: 0,
    taxPercent: 0,
    notes: 'Past due. Followup email sent 2026-04-30.',
    totals: {
      subtotalCents: 432000,
      markupCents: 0,
      taxCents: 0,
      totalCents: 432000,
    },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
  {
    id: mk('invoice-seed-paid'),
    organizationId: FIXTURE_ORG_ID,
    propertyId: SEED_PROPERTY.id,
    workOrderId: SEED_WO_ID,
    quoteId: null,
    invoiceNumber: 'INV-2026-0004',
    status: 'paid',
    issuedAt: '2026-03-15T17:00:00.000Z',
    sentAt: '2026-03-15T17:00:00.000Z',
    dueAt: '2026-04-15T17:00:00.000Z',
    paidAt: '2026-04-10T17:00:00.000Z',
    paidAmountCents: 75000,
    lineItems: [
      {
        id: mk('inv-line-4'),
        kind: 'labor',
        description: 'Initial site assessment',
        quantity: 1,
        unitCostCents: 75000,
      },
    ],
    markupPercent: 0,
    taxPercent: 0,
    notes: null,
    totals: {
      subtotalCents: 75000,
      markupCents: 0,
      taxCents: 0,
      totalCents: 75000,
    },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  },
]
