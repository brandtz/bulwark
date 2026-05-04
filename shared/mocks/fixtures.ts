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
