/**
 * server/utils/rpc-policy.ts — role policy for the RPC dispatcher (WP-L07 S7).
 *
 * # Decisions
 *   - Deny by default: every `service.method` reachable through
 *     /api/services/:service/:method must appear here. A method missing
 *     from the table is refused (403), and tests/unit/rpc-policy.test.ts
 *     fails when a contract method has no entry, so new methods cannot
 *     ship unclassified.
 *   - The tenant firewall (assertSameTenant) still runs inside each
 *     service; this table adds the role dimension it never had. Services
 *     remain callable without restriction from trusted server code
 *     (subscribers, jobs), which does not go through the dispatcher.
 *   - `system` methods are batch/maintenance entry points for cron and
 *     workers; no browser caller may invoke them.
 *   - Portal roles (homeowner, sub_contractor, stakeholder) get only
 *     self-scoped methods. Staff services list whole-org data and are
 *     never exposed to them.
 */
import type { Role } from '../../shared/contracts/_shared'

export const ADMIN: readonly Role[] = ['super_admin', 'org_admin', 'org_manager']
export const STAFF_WRITE: readonly Role[] = [...ADMIN, 'field']
export const STAFF: readonly Role[] = [...STAFF_WRITE, 'viewer']
export const SUB: readonly Role[] = ['sub_contractor']
export const HOMEOWNER: readonly Role[] = ['homeowner']
export const MEMBER: readonly Role[] = [...STAFF, ...SUB, ...HOMEOWNER, 'stakeholder']
export const SUPER: readonly Role[] = ['super_admin']

/** `public`: callable without a session. `system`: never callable over RPC. */
export type RpcRule = readonly Role[] | 'public' | 'system'

const admin = ADMIN
const staff = STAFF
const staffWrite = STAFF_WRITE
const member = MEMBER

export const RPC_POLICY: Record<string, Record<string, RpcRule>> = {
  auth: {
    login: 'public', verifyMfa: 'public', logout: 'public', currentUser: 'public',
    requestPasswordReset: 'public', resetPassword: 'public', previewInvite: 'public', acceptInvite: 'public',
    switchActiveOrg: member, changePassword: member,
    // Login history spans every tenant (auth_attempts has no org), so no RPC caller
    // may read it; operators use the database or logs.
    getAttempts: 'system', getLockoutState: 'system',
  },
  mfa: {
    getStatus: member, setupTotp: member, confirmTotp: member, verifyTotp: member, disable: member,
    generateBackupCodes: member, consumeBackupCode: member,
  },
  account: { exportPersonalData: member, requestDeletion: member, purgeExpiredDeletions: 'system' },
  themePreferences: { getCurrent: member, updateCurrent: member },
  notification: {
    listForUser: member, unreadCountForUser: member, markRead: member, markAllRead: member, enqueue: 'system',
  },
  notificationSubscription: {
    listForUser: member, upsert: member, bulkUpsert: member, resetToDefaults: member, list: admin,
  },
  // Labels and branding render every surface, portals included; edits are admin-only.
  label: { list: member, getMap: member, getBranding: member, upsert: admin, bulkUpsert: admin, delete: admin, updateBranding: admin },
  featureFlag: { listForOrg: member, get: member, list: admin, set: admin },

  property: {
    list: staff, get: staff, getMany: staff, getWithDepth: staff,
    create: staffWrite, update: staffWrite, updateStatus: staffWrite, softDelete: admin,
  },
  client: { list: staff, get: staff, create: admin },
  assessment: { list: staff, getLatestForProperty: staff, create: staffWrite },
  quote: {
    list: staff, get: staff, create: admin, markSent: admin, markAccepted: admin, revise: admin, reject: admin,
    expire: admin, expireBatch: admin,
    // Subcontractor bid response; the service scopes it to the caller's own sub record.
    respondToQuote: SUB,
  },
  subcontractor: {
    list: staff, get: staff, create: admin, update: admin, listUsers: [...ADMIN, ...SUB],
    inviteUser: admin, removeUser: admin, scanCoiExpiry: admin,
    // Self-scoped sub-portal methods.
    resolveSubForUser: [...ADMIN, ...SUB], listMyAssignments: SUB, listMyQuotesRequested: SUB,
    listCois: [...ADMIN, ...SUB], uploadCoi: [...ADMIN, ...SUB],
  },
  workOrder: {
    list: staff, get: staff, costRollup: staff,
    create: admin, assignTrade: admin, schedule: admin,
    updateTradeStatus: staffWrite, startSlot: staffWrite, completeSlot: staffWrite,
  },
  job: { get: staff, listRecentRuns: admin, create: admin },
  deliverable: { list: staff, get: staff, create: admin, syncFromJob: admin, reenqueue: admin, reconcileGenerating: 'system' },
  complianceDoc: { list: staff, get: staff, create: admin, syncFromJob: admin, reenqueue: admin, reconcileGenerating: 'system' },
  invoice: { list: staff, get: staff, create: admin, markSent: admin, markPaid: admin, recordPayment: admin, voidInvoice: admin },
  invoicePayment: { list: staff, listForInvoice: staff, recordPayment: admin, voidPayment: admin },
  changeOrder: { list: staff, get: staff, propose: staffWrite, approve: admin, reject: admin },
  standards: { get: staff, save: admin },
  inspection: {
    list: staff, get: staff, getWithResponses: staff, evaluate: staff,
    create: staffWrite, saveResponses: staffWrite, submit: staffWrite, sign: staffWrite,
  },
  inspectionTemplate: {
    list: staff, get: staff, getWithSections: staff,
    create: admin, update: admin, addSection: admin, addField: admin, updateField: admin, deleteField: admin,
    deleteSection: admin, activate: admin, bootstrap: admin,
  },
  building: {
    list: staff, listForProperty: staff, get: staff, listSections: staff,
    create: staffWrite, update: staffWrite, createSection: staffWrite, updateSection: staffWrite, reorderSections: staffWrite,
    softDelete: admin, softDeleteSection: admin,
  },
  contact: {
    list: staff, listForProperty: staff, listForClient: staff, get: staff,
    create: staffWrite, update: staffWrite, setPrimary: staffWrite, softDelete: admin,
  },
  propertyPhoto: {
    list: staff, listForProperty: staff, listForBuilding: staff, listForSection: staff, get: staff,
    create: staffWrite, update: staffWrite, reorder: staffWrite, softDelete: admin,
  },
  propertyAttachment: { list: staff, listForProperty: staff, get: staff, create: staffWrite, softDelete: admin },
  program: {
    list: staff, get: staff, listMembershipsFor: staff, listEntitiesForProgram: staff,
    create: admin, update: admin, softDelete: admin, assignToEntity: admin, unassignFromEntity: admin,
  },
  statusPipeline: {
    getActive: staff, list: staff, canTransition: staff,
    save: admin, bootstrap: admin, reconcileWithDefaults: 'system',
  },
  trade: { list: staff, get: staff, assertActiveSlugs: staff, create: admin, update: admin, softDelete: admin, bootstrap: admin },
  orgSettings: { get: staff, getOrganizationProfile: staff, update: admin, updateOrganizationProfile: admin },
  reporting: {
    dashboardKpis: staff, quotesByStatus: staff, wosByPriority: staff, arAging: staff, revenueTrend: staff,
    topProperties: staff, subcontractorPerformance: staff, inspectionPassRate: staff,
  },
  search: { search: staff, index: 'system' },
  savedView: { list: staff, get: staff, create: staff, update: staff, softDelete: staff, setDefault: staff },
  // Homeowner self-service reads are scoped to the caller inside the service.
  homeowner: {
    listForUser: admin,
    listMyProperties: HOMEOWNER, listMyQuotes: HOMEOWNER, getMyQuote: HOMEOWNER,
    listMyInvoices: HOMEOWNER, getMyInvoice: HOMEOWNER,
    listForProperty: admin, invite: admin, remove: admin,
  },

  // Organization administration.
  audit: { list: admin, timelineForProperty: staff, filter: admin, exportCsv: admin, record: 'system', logSystemError: 'system' },
  user: {
    list: admin, invite: admin, revokeInvite: admin, resendInvite: admin, setRole: admin,
    suspend: admin, reactivate: admin, deactivate: admin, transferOwnership: admin,
  },
  permission: { listForOrg: admin, getEffectivePermissions: member, upsert: admin, bulkUpsert: admin, resetToDefaults: admin },
  providerConfig: { list: admin, get: admin, upsert: admin, activate: admin },
  webhook: { list: admin, get: admin, create: admin, update: admin, softDelete: admin, test: admin, deliveries: admin },
  apiKey: { list: admin, create: admin, revoke: admin },
  comms: { deliveryHealth: admin },
  // WP-X3 / ED-00C: maps may render on any surface; address lookup is for staff who write.
  geo: { status: member, staticMap: member, autocomplete: staffWrite, geocode: staffWrite, route: staff },
  // WP-X3 / ED-00E: scanning state + rescan are admin tools.
  scan: { status: admin, rescan: admin },
  // WP-X3 / ED-016: self-scoped device management for every role.
  push: { config: member, subscribe: member, unsubscribe: member, listMine: member, sendTest: member },
  // WP-X2 / ED-036: people directory; contacts are the property join.
  person: {
    list: staff, get: staff, findByEmail: staff, listProperties: staff,
    create: staffWrite, update: staffWrite, attachToProperty: staffWrite, softDelete: admin,
  },
  // WP-X2 / ED-039: permits are field-editable; the jurisdiction catalog is admin-owned.
  permit: {
    list: staff, get: staff, listJurisdictions: staff,
    create: staffWrite, update: staffWrite, linkWorkOrder: staffWrite, unlinkWorkOrder: staffWrite, softDelete: admin,
    upsertJurisdiction: admin, deleteJurisdiction: admin,
  },
  // WP-X2 / ED-00D: staff sign anything in the org; homeowners only their own
  // quotes / change orders (enforced in the service by role + property link).
  signature: {
    create: [...staffWrite, ...HOMEOWNER], get: [...staff, ...HOMEOWNER],
    listForEntity: [...staff, ...HOMEOWNER], verify: staff,
  },
  // WP-X2 / ED-007: everyone reads + dismisses; only the platform operator writes.
  announcement: { listActive: member, dismiss: member, list: SUPER, upsert: SUPER, remove: SUPER },
  // WP-X2 / ED-015: a user's own sign-in sessions (scoped to the caller in the service).
  session: { listMine: member, revoke: member, revokeOthers: member },
  securityPolicy: { get: admin, update: admin, mfaRoster: admin, getMine: member },
}

export function isPublicRpc(service: string, method: string): boolean {
  return Object.hasOwn(RPC_POLICY, service) && RPC_POLICY[service]![method] === 'public'
}

export type RpcDecision =
  | { allowed: true }
  | { allowed: false, status: 401 | 403 | 404, reason: string }

/** Decide whether a caller with `role` (null = signed out) may invoke `service.method`. */
export function authorizeRpc(service: string, method: string, role: Role | null): RpcDecision {
  const rule = Object.hasOwn(RPC_POLICY, service) && Object.hasOwn(RPC_POLICY[service]!, method)
    ? RPC_POLICY[service]![method]!
    : undefined
  if (rule === undefined) return { allowed: false, status: 404, reason: `Unknown method: ${service}.${method}` }
  if (rule === 'public') return { allowed: true }
  if (rule === 'system') return { allowed: false, status: 403, reason: `${service}.${method} is not callable from clients` }
  if (!role) return { allowed: false, status: 401, reason: 'Authentication required' }
  if (!rule.includes(role)) return { allowed: false, status: 403, reason: `Role ${role} may not call ${service}.${method}` }
  return { allowed: true }
}
