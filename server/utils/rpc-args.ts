/**
 * server/utils/rpc-args.ts — argument schemas for every RPC method (WP-X4).
 *
 * The dispatcher validates positional args against this map before any
 * service code runs (server/utils/rpc-validation.ts): a malformed call is a
 * 400 with field-level issues, never a database 500. Schemas come from
 * shared/contracts (the contracts own the shapes); inline object types are
 * written here where the contract has no exported schema.
 *
 * Every method in the RPC policy (server/utils/rpc-policy.ts) must appear
 * here — tests/unit/rpc-validation.test.ts fails on an unclassified method.
 * `SYSTEM` marks methods the policy never exposes. Keep this file in sync
 * when a service signature changes: the coverage test only proves presence,
 * the e2e suites prove the shapes match real callers.
 */
import { z } from 'zod'
import { RoleSchema, UuidSchema } from '~~/shared/contracts/_shared'
import { AccountDeletionRequestSchema } from '~~/shared/contracts/account'
import { AnnouncementUpsertInputSchema } from '~~/shared/contracts/announcement'
import { ApiKeyCreateInputSchema } from '~~/shared/contracts/api-key'
import { AssessmentCreateInputSchema, AssessmentListInputSchema, ComplianceStandardsSchema } from '~~/shared/contracts/assessment'
import { AuditFilterInputSchema, AuditListInputSchema, TimelineForPropertyInputSchema } from '~~/shared/contracts/audit'
import { AcceptInviteInputSchema, ChangePasswordInputSchema, LoginInputSchema, RequestPasswordResetInputSchema, ResetPasswordInputSchema } from '~~/shared/contracts/auth'
import { BuildingCreateInputSchema, BuildingSectionCreateInputSchema, BuildingSectionUpdateInputSchema, BuildingUpdateInputSchema } from '~~/shared/contracts/building'
import { ChangeOrderApproveInputSchema, ChangeOrderListInputSchema, ChangeOrderProposeInputSchema, ChangeOrderRejectInputSchema } from '~~/shared/contracts/change-order'
import { ClientCreateInputSchema, ClientListInputSchema } from '~~/shared/contracts/client'
import { ComplianceDocCreateInputSchema, ComplianceDocListInputSchema } from '~~/shared/contracts/compliance'
import { ContactCreateInputSchema, ContactUpdateInputSchema } from '~~/shared/contracts/contact'
import { DeliverableCreateInputSchema, DeliverableListInputSchema } from '~~/shared/contracts/deliverable'
import { DeliveryHealthInputSchema } from '~~/shared/contracts/delivery'
import { FeatureFlagSetInputSchema } from '~~/shared/contracts/feature-flag'
import { GeoAutocompleteInputSchema, GeoGeocodeInputSchema, GeoRouteInputSchema, GeoStaticMapInputSchema } from '~~/shared/contracts/geo'
import { HomeownerInviteInputSchema } from '~~/shared/contracts/homeowner'
import { InspectionCreateInputSchema, InspectionListInputSchema, InspectionSignInputSchema, SaveResponsesInputSchema } from '~~/shared/contracts/inspection'
import { FieldAddInputSchema, FieldUpdateInputSchema, InspectionTemplateCreateInputSchema, InspectionTemplateListInputSchema, InspectionTemplateUpdateInputSchema, SectionAddInputSchema } from '~~/shared/contracts/inspection-template'
import { InvoiceCreateInputSchema, InvoiceListInputSchema } from '~~/shared/contracts/invoice'
import { InvoicePaymentListInputSchema, InvoicePaymentMethodSchema, InvoicePaymentRecordInputSchema } from '~~/shared/contracts/invoice-payment'
import { JobCreateInputSchema, JobKindSchema } from '~~/shared/contracts/job'
import { BrandingUpdateInputSchema, LabelBulkUpsertInputSchema, LabelListInputSchema, LabelUpsertInputSchema } from '~~/shared/contracts/label'
import { NotificationSubscriptionBulkInputSchema, NotificationSubscriptionUpsertInputSchema } from '~~/shared/contracts/notification-subscription'
import { OrgSettingsUpdateInputSchema, OrganizationProfileUpdateInputSchema } from '~~/shared/contracts/org-settings'
import { PermissionBulkUpsertInputSchema, PermissionUpsertInputSchema } from '~~/shared/contracts/permission'
import { PermitCreateInputSchema, PermitInspectionListInputSchema, PermitInspectionResultInputSchema, PermitInspectionScheduleInputSchema, PermitListInputSchema, PermitUpdateInputSchema } from '~~/shared/contracts/permit'
import { PersonAttachInputSchema, PersonCreateInputSchema, PersonListInputSchema, PersonUpdateInputSchema } from '~~/shared/contracts/person'
import { ProgramAssignInputSchema, ProgramCreateInputSchema, ProgramEntityTypeSchema, ProgramListInputSchema, ProgramUnassignInputSchema, ProgramUpdateInputSchema } from '~~/shared/contracts/program'
import { PropertyCreateInputSchema, PropertyListInputSchema, PropertyStatusDetailsSchema, PropertyStatusValueSchema, PropertyUpdateInputSchema } from '~~/shared/contracts/property'
import { PropertyAttachmentCreateInputSchema } from '~~/shared/contracts/property-attachment'
import { PropertyPhotoCreateInputSchema, PropertyPhotoUpdateInputSchema } from '~~/shared/contracts/property-photo'
import { ProviderConfigUpsertInputSchema, ProviderKindSchema } from '~~/shared/contracts/provider-config'
import { PushSubscribeInputSchema } from '~~/shared/contracts/push'
import { QuoteCreateInputSchema, QuoteListInputSchema, QuoteRejectedReasonCodeSchema } from '~~/shared/contracts/quote'
import { DateRangeSchema, TopPropertiesBySchema, TrendGranularitySchema } from '~~/shared/contracts/reporting'
import { SavedViewCreateInputSchema, SavedViewListInputSchema, SavedViewUpdateInputSchema } from '~~/shared/contracts/saved-view'
import { ScanRescanInputSchema } from '~~/shared/contracts/scan'
import { SearchInputSchema } from '~~/shared/contracts/search'
import { SecurityPolicyUpdateInputSchema } from '~~/shared/contracts/security-policy'
import { SignatureCreateInputSchema, SignedEntityTypeSchema } from '~~/shared/contracts/signature'
import { CanTransitionInputSchema, StatusPipelineEntityTypeSchema, StatusPipelineSaveInputSchema } from '~~/shared/contracts/status-pipeline'
import { SubCoiUploadInputSchema, SubInviteInputSchema, SubcontractorCreateInputSchema, SubcontractorListInputSchema, SubcontractorUpdateInputSchema } from '~~/shared/contracts/subcontractor'
import { ThemePreferencesUpdateInputSchema } from '~~/shared/contracts/theme-preferences'
import { TradeCreateInputSchema, TradeListInputSchema, TradeUpdateInputSchema } from '~~/shared/contracts/trade'
import { InviteInputSchema, SetRoleInputSchema, TransferOwnershipInputSchema, UserListInputSchema } from '~~/shared/contracts/user'
import { WebhookCreateInputSchema, WebhookUpdateInputSchema } from '~~/shared/contracts/webhook'
import { TradeSlotStatusSchema, WorkOrderCreateInputSchema, WorkOrderListInputSchema } from '~~/shared/contracts/work-order'

/** Ids are UUIDs everywhere in the schema. */
const id = UuidSchema

export interface ArgsSpec { kind: 'args', items: z.ZodTypeAny[] }
export interface SkipSpec { kind: 'skip', reason: string }
export type ArgsRule = ArgsSpec | SkipSpec

/** Positional args; trailing `.optional()` items may be omitted by the caller. */
const args = (...items: z.ZodTypeAny[]): ArgsSpec => ({ kind: 'args', items })
const SYSTEM: SkipSpec = { kind: 'skip', reason: 'system method: never callable over RPC' }

export const RPC_ARGS: Record<string, Record<string, ArgsRule>> = {
  account: {
    exportPersonalData: args(id),
    purgeExpiredDeletions: SYSTEM,
    requestDeletion: args(AccountDeletionRequestSchema),
  },
  announcement: {
    dismiss: args(id),
    list: args(),
    listActive: args(),
    remove: args(id),
    upsert: args(AnnouncementUpsertInputSchema),
  },
  apiKey: {
    create: args(ApiKeyCreateInputSchema),
    list: args(id),
    revoke: args(id, id),
  },
  assessment: {
    create: args(AssessmentCreateInputSchema),
    getLatestForProperty: args(id, id),
    list: args(AssessmentListInputSchema),
  },
  audit: {
    exportCsv: args(AuditFilterInputSchema.omit({ page: true, pageSize: true })),
    filter: args(AuditFilterInputSchema),
    list: args(AuditListInputSchema),
    logSystemError: SYSTEM,
    record: SYSTEM,
    timelineForProperty: args(TimelineForPropertyInputSchema),
  },
  auth: {
    acceptInvite: args(AcceptInviteInputSchema),
    changePassword: args(ChangePasswordInputSchema),
    currentUser: args(),
    getAttempts: SYSTEM,
    getLockoutState: SYSTEM,
    login: args(LoginInputSchema, z.object({ ipAddress: z.string().nullable().optional() }).optional()),
    logout: args(),
    previewInvite: args(z.string()),
    requestPasswordReset: args(RequestPasswordResetInputSchema),
    resetPassword: args(ResetPasswordInputSchema),
    switchActiveOrg: args(id),
    verifyMfa: args(z.string().min(1), z.string().min(1), z.object({ ipAddress: z.string().nullable().optional() }).optional()),
  },
  building: {
    create: args(BuildingCreateInputSchema),
    createSection: args(BuildingSectionCreateInputSchema),
    get: args(id, id),
    list: args(id),
    listForProperty: args(id, id),
    listSections: args(id, id),
    reorderSections: args(id, z.array(id), id),
    softDelete: args(id, id),
    softDeleteSection: args(id, id),
    update: args(BuildingUpdateInputSchema),
    updateSection: args(BuildingSectionUpdateInputSchema),
  },
  changeOrder: {
    approve: args(ChangeOrderApproveInputSchema),
    get: args(id, id),
    list: args(ChangeOrderListInputSchema),
    propose: args(ChangeOrderProposeInputSchema),
    reject: args(ChangeOrderRejectInputSchema),
  },
  client: {
    create: args(ClientCreateInputSchema),
    get: args(id, id),
    list: args(ClientListInputSchema),
  },
  comms: {
    deliveryHealth: args(DeliveryHealthInputSchema),
  },
  complianceDoc: {
    create: args(ComplianceDocCreateInputSchema),
    get: args(id, id),
    list: args(ComplianceDocListInputSchema),
    reconcileGenerating: SYSTEM,
    reenqueue: args(id, id),
    syncFromJob: args(id, id),
  },
  contact: {
    create: args(ContactCreateInputSchema),
    get: args(id, id),
    list: args(id),
    listForClient: args(id, id),
    listForProperty: args(id, id),
    setPrimary: args(id, id),
    softDelete: args(id, id),
    update: args(ContactUpdateInputSchema),
  },
  deliverable: {
    create: args(DeliverableCreateInputSchema),
    get: args(id, id),
    list: args(DeliverableListInputSchema),
    reconcileGenerating: SYSTEM,
    reenqueue: args(id, id),
    syncFromJob: args(id, id),
  },
  featureFlag: {
    get: args(id.nullable(), z.string()),
    list: args(),
    listForOrg: args(id),
    set: args(FeatureFlagSetInputSchema),
  },
  geo: {
    autocomplete: args(GeoAutocompleteInputSchema),
    geocode: args(GeoGeocodeInputSchema),
    route: args(GeoRouteInputSchema),
    staticMap: args(GeoStaticMapInputSchema),
    status: args(id),
  },
  homeowner: {
    getMyInvoice: args(id, id),
    getMyQuote: args(id, id),
    invite: args(HomeownerInviteInputSchema),
    listForProperty: args(id, id),
    listForUser: args(id, id),
    listMyInvoices: args(id),
    listMyProperties: args(id),
    listMyQuotes: args(id),
    remove: args(id, id),
  },
  inspection: {
    create: args(InspectionCreateInputSchema),
    evaluate: args(z.object({ organizationId: id, inspectionId: id })),
    get: args(id, id),
    getWithResponses: args(id, id),
    list: args(InspectionListInputSchema),
    saveResponses: args(SaveResponsesInputSchema),
    sign: args(InspectionSignInputSchema),
    submit: args(z.object({ organizationId: id, inspectionId: id })),
  },
  inspectionTemplate: {
    activate: args(z.object({ organizationId: id, templateId: id, isActive: z.boolean() })),
    addField: args(FieldAddInputSchema),
    addSection: args(SectionAddInputSchema),
    bootstrap: args(z.object({ organizationId: id, programId: id, programSlug: z.string().min(1) })),
    create: args(InspectionTemplateCreateInputSchema),
    deleteField: args(z.object({ organizationId: id, fieldId: id })),
    deleteSection: args(z.object({ organizationId: id, sectionId: id })),
    get: args(id, id),
    getWithSections: args(id, id, z.number().optional()),
    list: args(InspectionTemplateListInputSchema),
    update: args(InspectionTemplateUpdateInputSchema),
    updateField: args(FieldUpdateInputSchema),
  },
  invoice: {
    create: args(InvoiceCreateInputSchema),
    get: args(id, id),
    list: args(InvoiceListInputSchema),
    markPaid: args(id, id, z.number().optional()),
    markSent: args(id, id),
    recordPayment: args(z.object({ invoiceId: id, organizationId: id, amountCents: z.number().int().positive(), method: InvoicePaymentMethodSchema, reference: z.string().nullable().optional(), notes: z.string().nullable().optional(), receivedAt: z.string().optional(), recordedByUserId: id.nullable().optional() })),
    voidInvoice: args(z.object({ invoiceId: id, organizationId: id, reason: z.string().min(1) })),
  },
  invoicePayment: {
    list: args(InvoicePaymentListInputSchema),
    listForInvoice: args(id, id),
    recordPayment: args(InvoicePaymentRecordInputSchema),
    voidPayment: args(id, id),
  },
  job: {
    create: args(JobCreateInputSchema),
    get: args(id, id),
    listRecentRuns: args(z.object({ kinds: z.array(JobKindSchema), limit: z.number().int().positive().optional() })),
  },
  label: {
    bulkUpsert: args(LabelBulkUpsertInputSchema),
    delete: args(id, id),
    getBranding: args(id),
    getMap: args(id, z.string().optional()),
    list: args(LabelListInputSchema),
    updateBranding: args(BrandingUpdateInputSchema),
    upsert: args(LabelUpsertInputSchema),
  },
  mfa: {
    confirmTotp: args(id, z.string()),
    consumeBackupCode: args(id, z.string()),
    disable: args(id, z.string()),
    generateBackupCodes: args(id),
    getStatus: args(id),
    setupTotp: args(id),
    verifyTotp: args(id, z.string()),
  },
  notification: {
    enqueue: SYSTEM,
    listForUser: args(id, z.object({ unreadOnly: z.boolean().optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().optional(), afterCreatedAt: z.string().optional(), afterId: id.optional() }).optional()),
    markAllRead: args(id),
    markRead: args(id),
    unreadCountForUser: args(id),
  },
  notificationSubscription: {
    bulkUpsert: args(NotificationSubscriptionBulkInputSchema),
    list: args(id),
    listForUser: args(id, id),
    resetToDefaults: args(id, id),
    upsert: args(NotificationSubscriptionUpsertInputSchema),
  },
  orgSettings: {
    get: args(id),
    getOrganizationProfile: args(id),
    update: args(OrgSettingsUpdateInputSchema),
    updateOrganizationProfile: args(OrganizationProfileUpdateInputSchema),
  },
  permission: {
    bulkUpsert: args(PermissionBulkUpsertInputSchema),
    getEffectivePermissions: args(RoleSchema, id),
    listForOrg: args(id),
    resetToDefaults: args(id),
    upsert: args(PermissionUpsertInputSchema),
  },
  permit: {
    create: args(PermitCreateInputSchema),
    deleteJurisdiction: args(id, id),
    get: args(id, id),
    linkWorkOrder: args(z.object({ organizationId: id, permitId: id, workOrderId: id })),
    list: args(PermitListInputSchema),
    listInspections: args(PermitInspectionListInputSchema),
    listJurisdictions: args(id),
    recordInspectionResult: args(PermitInspectionResultInputSchema),
    scheduleInspection: args(PermitInspectionScheduleInputSchema),
    softDelete: args(id, id),
    unlinkWorkOrder: args(z.object({ organizationId: id, permitId: id, workOrderId: id })),
    update: args(PermitUpdateInputSchema),
    upsertJurisdiction: args(z.object({ organizationId: id, id: id.optional(), name: z.string().min(1), code: z.string().nullable().optional() })),
  },
  person: {
    attachToProperty: args(PersonAttachInputSchema),
    create: args(PersonCreateInputSchema),
    findByEmail: args(z.string(), id),
    get: args(id, id),
    list: args(PersonListInputSchema),
    listProperties: args(id, id),
    softDelete: args(id, id),
    update: args(PersonUpdateInputSchema),
  },
  program: {
    assignToEntity: args(ProgramAssignInputSchema),
    create: args(ProgramCreateInputSchema),
    get: args(id, id),
    list: args(ProgramListInputSchema),
    listEntitiesForProgram: args(z.object({ organizationId: id, programId: id, entityType: ProgramEntityTypeSchema })),
    listMembershipsFor: args(z.object({ organizationId: id, entityType: ProgramEntityTypeSchema, entityId: id })),
    softDelete: args(id, id),
    unassignFromEntity: args(ProgramUnassignInputSchema),
    update: args(ProgramUpdateInputSchema),
  },
  property: {
    create: args(PropertyCreateInputSchema),
    get: args(id, id),
    getMany: args(z.array(id), id),
    getWithDepth: args(id, id),
    list: args(PropertyListInputSchema),
    softDelete: args(id, id),
    summaries: args(z.array(id), id),
    update: args(PropertyUpdateInputSchema),
    updateStatus: args(id, PropertyStatusValueSchema, id, z.string().optional(), PropertyStatusDetailsSchema.optional()),
  },
  propertyAttachment: {
    create: args(PropertyAttachmentCreateInputSchema),
    get: args(id, id),
    list: args(id),
    listForProperty: args(id, id),
    softDelete: args(id, id),
  },
  propertyPhoto: {
    create: args(PropertyPhotoCreateInputSchema),
    get: args(id, id),
    list: args(id),
    listForBuilding: args(id, id),
    listForProperty: args(id, id),
    listForSection: args(id, id),
    reorder: args(id, z.array(id), id),
    softDelete: args(id, id),
    update: args(PropertyPhotoUpdateInputSchema),
  },
  providerConfig: {
    activate: args(id, id),
    get: args(id, ProviderKindSchema),
    list: args(id),
    upsert: args(ProviderConfigUpsertInputSchema),
  },
  push: {
    config: args(id),
    listMine: args(id),
    sendTest: args(id),
    subscribe: args(PushSubscribeInputSchema),
    unsubscribe: args(z.object({ organizationId: id, endpoint: z.string().min(1) })),
  },
  quote: {
    create: args(QuoteCreateInputSchema),
    expire: args(id, id),
    expireBatch: args(z.object({ organizationId: id, nowIso: z.string().optional() })),
    get: args(id, id),
    list: args(QuoteListInputSchema),
    markAccepted: args(id, id),
    markSent: args(id, id),
    reject: args(z.object({ id: id, organizationId: id, reason: z.string(), reasonCode: QuoteRejectedReasonCodeSchema })),
    respondToQuote: args(z.object({ id: id, organizationId: id, subcontractorId: id, response: z.enum(['accepted', 'declined']), notes: z.string().optional() })),
    revise: args(id, id),
  },
  reporting: {
    arAging: args(z.object({ organizationId: id, asOf: z.string().optional() })),
    dashboardKpis: args(z.object({ organizationId: id, range: DateRangeSchema })),
    inspectionPassRate: args(z.object({ organizationId: id, range: DateRangeSchema })),
    quotesByStatus: args(z.object({ organizationId: id, range: DateRangeSchema })),
    revenueTrend: args(z.object({ organizationId: id, granularity: TrendGranularitySchema, range: DateRangeSchema })),
    subcontractorPerformance: args(z.object({ organizationId: id, range: DateRangeSchema })),
    topProperties: args(z.object({ organizationId: id, range: DateRangeSchema, by: TopPropertiesBySchema, limit: z.number().int().positive() })),
    wosByPriority: args(z.object({ organizationId: id, range: DateRangeSchema })),
  },
  savedView: {
    create: args(SavedViewCreateInputSchema),
    get: args(id, id),
    list: args(SavedViewListInputSchema),
    setDefault: args(id, id),
    softDelete: args(id, id),
    update: args(SavedViewUpdateInputSchema),
  },
  scan: {
    rescan: args(ScanRescanInputSchema),
    status: args(id),
  },
  search: {
    index: SYSTEM,
    search: args(SearchInputSchema),
  },
  securityPolicy: {
    get: args(id),
    getMine: args(),
    mfaRoster: args(id),
    update: args(SecurityPolicyUpdateInputSchema),
  },
  session: {
    listMine: args(),
    revoke: args(id),
    revokeOthers: args(),
  },
  signature: {
    create: args(SignatureCreateInputSchema),
    get: args(id, id),
    listForEntity: args(z.object({ organizationId: id, entityType: SignedEntityTypeSchema, entityId: id })),
    verify: args(z.object({ organizationId: id, id: id, documentHash: z.string().min(1) })),
  },
  standards: {
    get: args(id),
    save: args(id, ComplianceStandardsSchema, id.nullable()),
  },
  statusPipeline: {
    bootstrap: args(z.object({ organizationId: id, entityType: StatusPipelineEntityTypeSchema })),
    canTransition: args(CanTransitionInputSchema),
    getActive: args(z.object({ organizationId: id, entityType: StatusPipelineEntityTypeSchema })),
    list: args(z.object({ organizationId: id, entityType: StatusPipelineEntityTypeSchema.optional() })),
    reconcileWithDefaults: SYSTEM,
    save: args(StatusPipelineSaveInputSchema),
  },
  subcontractor: {
    create: args(SubcontractorCreateInputSchema),
    get: args(id, id),
    inviteUser: args(SubInviteInputSchema),
    list: args(SubcontractorListInputSchema),
    listCois: args(id, id),
    listMyAssignments: args(id, id),
    listMyQuotesRequested: args(id, id),
    listUsers: args(id, id),
    removeUser: args(id, id),
    resolveSubForUser: args(id, id),
    scanCoiExpiry: args(z.object({ organizationId: id, withinDays: z.number().int().positive().optional(), nowIso: z.string().optional() })),
    update: args(id, SubcontractorUpdateInputSchema, id),
    uploadCoi: args(SubCoiUploadInputSchema),
  },
  themePreferences: {
    getCurrent: args(),
    updateCurrent: args(ThemePreferencesUpdateInputSchema),
  },
  trade: {
    assertActiveSlugs: args(id, z.array(z.string())),
    bootstrap: args(z.object({ organizationId: id })),
    create: args(TradeCreateInputSchema),
    get: args(id, id),
    list: args(TradeListInputSchema),
    softDelete: args(id, id),
    update: args(TradeUpdateInputSchema),
  },
  user: {
    deactivate: args(id, id),
    invite: args(InviteInputSchema),
    list: args(UserListInputSchema),
    reactivate: args(id, id),
    resendInvite: args(id, id),
    revokeInvite: args(id, id),
    setRole: args(SetRoleInputSchema),
    suspend: args(id, id),
    transferOwnership: args(TransferOwnershipInputSchema),
  },
  webhook: {
    create: args(WebhookCreateInputSchema),
    deliveries: args(id, id, z.number().optional()),
    get: args(id, id),
    list: args(id),
    softDelete: args(id, id),
    test: args(id, id),
    update: args(WebhookUpdateInputSchema),
  },
  workOrder: {
    assignTrade: args(id, id, id.nullable(), id),
    completeSlot: args(z.object({ workOrderId: id, tradeSlotId: z.string().min(1), organizationId: id, actualHours: z.number().min(0), notes: z.string().nullable().optional() })),
    costRollup: args(z.object({ workOrderId: id, organizationId: id })),
    create: args(WorkOrderCreateInputSchema),
    get: args(id, id),
    list: args(WorkOrderListInputSchema),
    schedule: args(z.object({ workOrderId: id, organizationId: id, scheduledStart: z.string().nullable(), scheduledEnd: z.string().nullable() })),
    startSlot: args(z.object({ workOrderId: id, tradeSlotId: z.string().min(1), organizationId: id })),
    updateTradeStatus: args(id, id, TradeSlotStatusSchema, id),
  },
}
