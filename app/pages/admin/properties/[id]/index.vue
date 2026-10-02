<!--
  app/pages/admin/properties/[id]/index.vue — AD-12 property hub (WP-B2).

  Header: address (h1), the AD-13 status control (PropertyStatusControl),
  a meta row (city, client, programs, assignee) and the New Inspection /
  New Quote / New Job actions. Four stat cards (a <dl>): contract value,
  invoiced, balance (danger when > 0), next milestone — money from
  property.summaries (ED-066). On hold / Cancelled show a banner with the
  reason, date and actor, plus Resume / Reopen when the pipeline allows it;
  a cancelled property is read-only apart from Reopen.

  Tabs (11, URL-addressable via ?tab=, scroll position remembered per tab):
  Overview, Inspections, Quotes, Jobs, Invoices, Documents, Photos,
  Attachments, Contacts, Buildings, Activity. Counts are hidden at 0 and
  read as "Quotes, 3 items". With more than 8 tabs a "More" menu jumps to
  any tab (ED-032); phones show Overview / Inspections / Quotes / Jobs +
  More and a sticky New Quote / New Job bar. Old ?tab= values (assessment,
  work-orders, compliance) still resolve. Photos / Attachments / Contacts /
  Buildings summarise here and link to their depth pages (WP-B3 rebuilds
  those). Programs progress = 4 lifecycle stages (inspection done, quote
  accepted, job completed, deliverable ready) until programs gain stages.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { safeUrl } from '~/utils/safeUrl'
import { evaluateCompliance } from '~~/shared/utils/compliance'
import { formatCents } from '~~/shared/utils/money'
import type { MenuEntry } from '~/components/ui/BulwarkMenu.vue'
import { PROPERTY_STATUS_LABEL, type PropertyStatus } from '~~/shared/contracts/property'
import type { Quote } from '~~/shared/contracts/quote'
import type { WorkOrder } from '~~/shared/contracts/work-order'
import type { Invoice } from '~~/shared/contracts/invoice'
import type { ComplianceDoc } from '~~/shared/contracts/compliance'
import type { AuditLogRow } from '~~/shared/contracts/audit'
import type { UserAdminRow } from '~~/shared/contracts/user'
import type { Program } from '~~/shared/contracts/program'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const router = useRouter()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const canEdit = computed(() => ['super_admin', 'org_admin', 'org_manager'].includes(session.value?.activeRole ?? ''))

const property = useService('property')
const client = useService('client')
const assessment = useService('assessment')
const quoteSvc = useService('quote')
const workOrderSvc = useService('workOrder')
const invoiceSvc = useService('invoice')
const deliverableSvc = useService('deliverable')
const standardsSvc = useService('standards')
const auditSvc = useService('audit')
const pipelineSvc = useService('statusPipeline')
const userSvc = useService('user')
const programSvc = useService('program')
const photoSvc = useService('propertyPhoto')
const attachmentSvc = useService('propertyAttachment')
const { t: tLabel } = useLabel()
const toast = useToast()

const { data: detail, pending, refresh } = await useAsyncData(
  () => `property-detail-${propertyId.value}-${orgId.value}`,
  async () => {
    const p = await property.get(propertyId.value, orgId.value)
    if (!p) return null
    const org = orgId.value
    // EH-D / W1-4: parallel rollup fetch, every child list scoped by property.
    const [c, a, quotes, workOrders, invoices, complianceDocs, timeline, standards, pipeline, summaries, users, memberships, programs, photos, attachments] =
      await Promise.all([
        p.clientId ? client.get(p.clientId, org) : Promise.resolve(null),
        assessment.getLatestForProperty(p.id, org),
        quoteSvc.list({ organizationId: org, propertyId: p.id, page: 1, pageSize: 50 }).then((r) => r.rows).catch((): Quote[] => []),
        workOrderSvc.list({ organizationId: org, propertyId: p.id, page: 1, pageSize: 50 }).then((r) => r.rows).catch((): WorkOrder[] => []),
        invoiceSvc.list({ organizationId: org, propertyId: p.id, page: 1, pageSize: 50 }).then((r) => r.rows).catch((): Invoice[] => []),
        deliverableSvc.list({ organizationId: org, propertyId: p.id }).catch((): ComplianceDoc[] => []),
        auditSvc.timelineForProperty({ organizationId: org, propertyId: p.id, limit: 200 }).catch((): AuditLogRow[] => []),
        standardsSvc.get(org).then((row) => row.standards),
        pipelineSvc.getActive({ organizationId: org, entityType: 'property' }).then((pl) => pl ?? pipelineSvc.bootstrap({ organizationId: org, entityType: 'property' })),
        property.summaries([p.id], org).catch(() => []),
        userSvc.list({ organizationId: org }).then((r) => r.users).catch((): UserAdminRow[] => []),
        programSvc.listMembershipsFor({ organizationId: org, entityType: 'property', entityId: p.id }).catch(() => []),
        programSvc.list({ organizationId: org, page: 1, pageSize: 200, includeInactive: true }).then((r) => r.rows).catch((): Program[] => []),
        photoSvc.listForProperty(p.id, org).catch(() => []),
        attachmentSvc.listForProperty(p.id, org).catch(() => []),
      ])
    return {
      property: p,
      client: c,
      assessment: a,
      quotes,
      workOrders,
      invoices,
      complianceDocs,
      timeline,
      standards,
      statuses: [...pipeline.nodes].sort((x, y) => x.sortOrder - y.sortOrder),
      summary: summaries[0] ?? null,
      users,
      programs: memberships.map((m) => programs.find((pr) => pr.id === m.programId)).filter((pr): pr is Program => !!pr),
      photos,
      attachments,
    }
  },
  { watch: [propertyId, orgId] },
)

// W2-1 / EH-E (ADR-0018): buildings, contacts, primary photo — separate fetch
// so a depth failure never blanks the rollup.
const { data: depth } = await useAsyncData(
  () => `property-depth-${propertyId.value}-${orgId.value}`,
  () => property.getWithDepth(propertyId.value, orgId.value).catch(() => null),
  { default: () => null, watch: [propertyId, orgId] },
)

const p = computed(() => detail.value?.property ?? null)
useHead(() => ({ title: p.value ? `${p.value.addressLine1} — Bulwark` : 'Property — Bulwark' }))

const statusLabel = (slug: string) => tLabel('status.property', slug, PROPERTY_STATUS_LABEL[slug as PropertyStatus] ?? slug.replaceAll('_', ' ').replace(/^./u, (c) => c.toUpperCase()))
const nodeBy = computed(() => new Map((detail.value?.statuses ?? []).map((n) => [n.slug, n])))
const userName = (id: string | null) => {
  if (!id) return 'System'
  const u = detail.value?.users.find((x) => x.id === id && x.kind === 'member')
  return u && u.kind === 'member' ? u.fullName : 'A former member'
}
const staff = computed(() => (detail.value?.users ?? []).filter((u) => u.kind === 'member' && u.status === 'active' && ['super_admin', 'org_admin', 'org_manager', 'field'].includes(u.role)))
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const money = (cents: number | null | undefined) => (cents ? formatCents(cents) : '$0.00')

// ---- hold / cancel ----------------------------------------------------------------
const isHold = computed(() => p.value?.status === 'on_hold')
const isCancelled = computed(() => p.value?.status === 'cancelled')
const readonly = computed(() => isCancelled.value || !canEdit.value)
const lastChange = computed(() => (detail.value?.timeline ?? []).find((r) => r.action === 'state_change' && r.entityId === p.value?.id))
/** Resume / Reopen target: the first legal non-hold, non-cancel transition. */
const resumeTarget = computed(() => nodeBy.value.get(p.value?.status ?? '')?.allowedTransitions.find((s) => s !== 'on_hold' && s !== 'cancelled') ?? null)
const resumeOpen = ref(false)
async function resume() {
  if (!p.value || !resumeTarget.value) return
  resumeOpen.value = false
  try {
    await property.updateStatus(p.value.id, resumeTarget.value, orgId.value)
    toast.push({ title: `Moved to ${statusLabel(resumeTarget.value)}`, tone: 'success' })
    await refresh()
  } catch (e) {
    toast.push({ title: 'The status was not changed', body: String((e as Error)?.message ?? e).replace(/^.*?: /u, ''), tone: 'error' })
  }
}

// ---- assignee (Details card) -----------------------------------------------------------
const assigneeOptions = computed(() => [{ value: '', label: 'Unassigned' }, ...staff.value.map((u) => ({ value: u.id, label: u.kind === 'member' ? u.fullName : u.email }))])
async function setAssignee(value: string | null) {
  if (!p.value) return
  try {
    await property.update({ id: p.value.id, organizationId: orgId.value, assigneeUserId: value || null })
    await refresh()
  } catch (e) {
    toast.push({ title: 'Assignee not saved', body: String((e as Error)?.message ?? e).replace(/^.*?: /u, ''), tone: 'error' })
  }
}

// ---- derived lists ----------------------------------------------------------------------
const quotes = computed(() => detail.value?.quotes ?? [])
const jobs = computed(() => detail.value?.workOrders ?? [])
const invoices = computed(() => detail.value?.invoices ?? [])
const docs = computed(() => detail.value?.complianceDocs ?? [])
const unpaid = computed(() => invoices.value.filter((i) => i.status === 'sent' || i.status === 'partial'))
const compliance = computed(() => {
  const a = detail.value?.assessment
  const standards = detail.value?.standards
  return a && standards ? evaluateCompliance(a, standards) : null
})

interface OpenItem { id: string, icon: 'dollar-sign' | 'wrench' | 'file-text' | 'clipboard', title: string, context: string, status: string, to: string }
const openItems = computed<OpenItem[]>(() => {
  const out: OpenItem[] = []
  for (const i of unpaid.value) {
    out.push({ id: i.id, icon: 'dollar-sign', title: `Invoice ${i.invoiceNumber}`, context: `${formatCents(i.totals.totalCents - i.paidAmountCents)} due ${fmtDate(i.dueDate ?? i.dueAt)}`, status: i.status, to: `/admin/invoices/${i.id}` })
  }
  for (const w of jobs.value.filter((x) => x.status === 'scheduled' || x.status === 'in_progress' || x.status === 'draft')) {
    out.push({ id: w.id, icon: 'wrench', title: `Job ${w.workOrderNumber}`, context: w.scheduledStart ? `Starts ${fmtDate(w.scheduledStart)}` : 'Not scheduled', status: w.status, to: `/admin/work-orders/${w.id}` })
  }
  for (const q of quotes.value.filter((x) => x.status === 'sent' || x.status === 'draft')) {
    out.push({ id: q.id, icon: 'file-text', title: `Quote ${q.quoteNumber}`, context: q.status === 'sent' ? `Awaiting client${q.expiresAt ? ` · expires ${fmtDate(q.expiresAt)}` : ''}` : 'Draft', status: q.status, to: `/admin/properties/${propertyId.value}/quotes/${q.id}` })
  }
  for (const d of docs.value.filter((x) => x.status === 'draft' || x.status === 'failed')) {
    out.push({ id: d.id, icon: 'clipboard', title: 'Compliance document', context: d.status === 'failed' ? 'Generation failed' : 'Draft', status: d.status, to: `/admin/properties/${propertyId.value}/compliance/${d.id}` })
  }
  return out.slice(0, 5)
})

const nextMilestone = computed(() => {
  const now = new Date().toISOString()
  const due = unpaid.value.map((i) => ({ at: i.dueDate ?? i.dueAt, label: 'Payment due' })).filter((x) => x.at && x.at >= now.slice(0, 10))
  const starts = jobs.value.filter((w) => w.scheduledStart && w.scheduledStart >= now).map((w) => ({ at: w.scheduledStart, label: 'Job starts' }))
  const next = [...due, ...starts].sort((a, b) => String(a.at).localeCompare(String(b.at)))[0]
  return next ? `${next.label} ${fmtDate(next.at)}` : 'None scheduled'
})

const stages = computed(() => [
  { label: 'Inspection', done: !!detail.value?.assessment },
  { label: 'Quote accepted', done: quotes.value.some((q) => q.status === 'accepted') },
  { label: 'Job completed', done: jobs.value.some((w) => w.status === 'completed') },
  { label: 'Deliverable', done: docs.value.some((d) => d.status === 'ready') },
])
const stageProgress = computed(() => Math.round((stages.value.filter((s) => s.done).length / stages.value.length) * 100))

const activity = computed(() => (detail.value?.timeline ?? []).slice(0, 5).map((r) => ({
  id: r.id,
  actor: userName(r.actorUserId),
  action: r.action === 'state_change'
    ? `moved ${r.entityType} to ${statusLabel(String(r.metadata.to ?? ''))}`
    : `${r.action.replaceAll('_', ' ')} ${r.entityType.replaceAll('_', ' ')}`,
  at: r.createdAt,
  detail: typeof r.metadata.reason === 'string' ? r.metadata.reason : undefined,
})))

const details = computed(() => {
  const x = p.value
  if (!x) return []
  return [
    { key: 'Address', value: `${x.addressLine1}${x.addressLine2 ? `, ${x.addressLine2}` : ''}, ${x.city}, ${x.state} ${x.postalCode}` },
    { key: 'Client', value: detail.value?.client?.fullName ?? 'No client linked' },
    { key: 'Parcel #', value: x.parcelNumber },
    { key: 'Year built', value: x.yearBuilt },
    { key: 'Lot size', value: x.lotSizeAcres != null ? `${x.lotSizeAcres} ac` : null },
    { key: 'Gate code', value: x.gateCode },
    { key: 'Access notes', value: x.accessNotes },
    { key: 'Special instructions', value: x.specialInstructions },
  ].filter((i) => i.value !== null && i.value !== undefined && i.value !== '')
})

// ---- tabs -------------------------------------------------------------------------------
type TabKey = 'overview' | 'inspections' | 'quotes' | 'jobs' | 'invoices' | 'documents' | 'photos' | 'attachments' | 'contacts' | 'buildings' | 'activity'
const ALIASES: Record<string, TabKey> = { assessment: 'inspections', 'work-orders': 'jobs', compliance: 'documents' }
const tabs = computed<Array<{ value: TabKey, label: string, count?: number }>>(() => [
  { value: 'overview', label: 'Overview' },
  { value: 'inspections', label: 'Inspections', count: detail.value?.assessment ? 1 : 0 },
  { value: 'quotes', label: 'Quotes', count: quotes.value.length },
  { value: 'jobs', label: 'Jobs', count: jobs.value.length },
  { value: 'invoices', label: 'Invoices', count: invoices.value.length },
  { value: 'documents', label: 'Documents', count: docs.value.length },
  { value: 'photos', label: 'Photos', count: detail.value?.photos.length ?? 0 },
  { value: 'attachments', label: 'Attachments', count: detail.value?.attachments.length ?? 0 },
  { value: 'contacts', label: 'Contacts', count: depth.value?.contacts.length ?? 0 },
  { value: 'buildings', label: 'Buildings', count: depth.value?.buildings.length ?? 0 },
  { value: 'activity', label: 'Activity' },
])
function readTab(): TabKey {
  const raw = String(Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab ?? '')
  const v = ALIASES[raw] ?? raw
  return tabs.value.some((t) => t.value === v) ? v as TabKey : 'overview'
}
const activeTab = ref<TabKey>(readTab())
const scrollBy = new Map<string, number>()
watch(activeTab, (next, prev) => {
  if (import.meta.client) scrollBy.set(prev, window.scrollY)
  void router.replace({ query: { ...route.query, tab: next === 'overview' ? undefined : next } }).then(() => {
    if (import.meta.client) nextTick(() => window.scrollTo({ top: scrollBy.get(next) ?? 0 }))
  })
})
watch(() => route.query.tab, () => { activeTab.value = readTab() })

const narrow = ref(false)
onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  narrow.value = mq.matches
  mq.addEventListener('change', (e) => { narrow.value = e.matches })
})
const PHONE_TABS: TabKey[] = ['overview', 'inspections', 'quotes', 'jobs']
const visibleTabs = computed(() => (narrow.value
  ? tabs.value.filter((t) => PHONE_TABS.includes(t.value) || t.value === activeTab.value)
  : tabs.value))
const moreItems = computed<MenuEntry[]>(() => tabs.value
  .filter((t) => !narrow.value || !PHONE_TABS.includes(t.value))
  .map((t) => ({ label: t.count ? `${t.label} (${t.count})` : t.label, value: t.value })))

const base = computed(() => `/admin/properties/${propertyId.value}`)
</script>

<template>
  <div class="p-4 md:p-6 flex flex-col gap-4 min-w-0" :class="narrow && p && !readonly && 'pb-24'" data-testid="property-detail">
    <div v-if="pending && !detail" class="flex flex-col gap-4" data-testid="property-loading">
      <BulwarkSkeleton class="h-16 w-2/3" />
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4"><BulwarkSkeleton v-for="i in 4" :key="i" class="h-20" /></div>
      <BulwarkSkeleton class="h-64" />
    </div>

    <template v-else-if="!p">
      <BulwarkBreadcrumbs :items="[{ label: 'Properties', to: '/admin/properties' }, { label: 'Not found' }]" />
      <EmptyState
        icon="·"
        title="Property not found"
        body="It may have been deleted, or you don't have access."
        :cta="{ label: 'Back to pipeline', to: '/admin/properties' }"
        data-testid="property-not-found"
      />
    </template>

    <template v-else-if="detail">
      <BulwarkPageHeader
        :title="p.addressLine1"
        :breadcrumbs="[{ label: 'Properties', to: '/admin/properties' }, { label: p.addressLine1 }]"
        :chips="detail.programs.map((pr) => ({ label: pr.name }))"
        :meta="[`${p.city}, ${p.state}`, detail.client ? `Client: ${detail.client.fullName}` : null, `Assigned: ${p.assigneeUserId ? userName(p.assigneeUserId) : 'Unassigned'}`].filter(Boolean).join(' · ')"
        class="sticky top-0 z-10"
        style="background: var(--bg-page)"
        data-testid="property-header"
      >
        <template #actions>
          <PropertyStatusControl
            :property="p"
            :statuses="detail.statuses"
            :open-invoice-count="detail.summary?.openInvoiceCount ?? unpaid.length"
            :history="detail.timeline.filter((r) => r.entityId === p!.id)"
            :actor-name="userName"
            :disabled="!canEdit"
            @changed="refresh()"
          />
          <template v-if="!readonly && !narrow">
            <NuxtLink :to="`${base}/assessment`" class="bw-btn bw-btn--secondary" data-testid="hub-new-inspection">New inspection</NuxtLink>
            <NuxtLink :to="`${base}/quotes/new`" class="bw-btn bw-btn--secondary" data-testid="hub-new-quote">New quote</NuxtLink>
            <NuxtLink v-if="!isHold" :to="`${base}/work-orders/new`" class="bw-btn bw-btn--primary" data-testid="hub-new-job">New job</NuxtLink>
          </template>
        </template>
      </BulwarkPageHeader>
      <!-- Legacy hooks: older specs read the address from these. -->
      <span class="sr-only" data-testid="property-address">{{ p.addressLine1 }}</span>

      <BulwarkBanner v-if="isHold" tone="warning" data-testid="hold-banner" :action="canEdit && resumeTarget ? { label: 'Resume', fn: () => (resumeOpen = true) } : null">
        On hold since {{ fmtDate(p.statusChangedAt) }}<template v-if="lastChange"> by {{ userName(lastChange.actorUserId) }}</template>
        <template v-if="p.statusReason">: {{ p.statusReason }}</template>.
        <template v-if="p.statusNote"> {{ p.statusNote }}</template>
        <template v-if="p.resumeOn"> Expected to resume {{ fmtDate(p.resumeOn) }}.</template>
        New jobs are paused.
      </BulwarkBanner>
      <BulwarkBanner v-if="isCancelled" tone="readonly" data-testid="cancel-banner" :action="canEdit && resumeTarget ? { label: 'Reopen', fn: () => (resumeOpen = true) } : null">
        Cancelled {{ fmtDate(p.statusChangedAt) }}<template v-if="lastChange"> by {{ userName(lastChange.actorUserId) }}</template>
        <template v-if="p.statusReason">: {{ p.statusReason }}</template>.
        <template v-if="p.statusNote"> {{ p.statusNote }}</template>
        This property is read-only<template v-if="!resumeTarget">; reopening needs a transition from Cancelled in Settings → Pipelines</template>.
      </BulwarkBanner>

      <dl class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="hub-stats">
        <div class="bw-card bw-card--sm">
          <dt class="bw-help">Contract value</dt>
          <dd class="text-xl font-semibold tnum" data-testid="stat-contract">{{ money(detail.summary?.contractValueCents) }}</dd>
        </div>
        <div class="bw-card bw-card--sm">
          <dt class="bw-help">Invoiced</dt>
          <dd class="text-xl font-semibold tnum" data-testid="stat-invoiced">{{ money(detail.summary?.invoicedCents) }}</dd>
        </div>
        <div class="bw-card bw-card--sm" :class="narrow && 'hidden'">
          <dt class="bw-help">Balance</dt>
          <dd class="text-xl font-semibold tnum" :style="(detail.summary?.balanceCents ?? 0) > 0 ? 'color: var(--danger-fg)' : undefined" data-testid="stat-balance">
            {{ money(detail.summary?.balanceCents) }}<span v-if="(detail.summary?.balanceCents ?? 0) > 0" class="sr-only"> outstanding</span>
          </dd>
        </div>
        <div class="bw-card bw-card--sm" :class="narrow && 'hidden'">
          <dt class="bw-help">Next milestone</dt>
          <dd class="font-semibold" data-testid="stat-milestone">{{ nextMilestone }}</dd>
        </div>
      </dl>

      <div class="flex items-end gap-2 min-w-0">
        <BulwarkTabs
          v-model="activeTab"
          :tabs="visibleTabs"
          aria-label="Property sections"
          hide-zero
          class="min-w-0 flex-1"
          data-testid="property-tabs"
        >
          <template #tab-overview>
            <section class="grid grid-cols-1 xl:grid-cols-3 gap-4" data-testid="tab-panel-overview">
              <div class="xl:col-span-2 flex flex-col gap-4">
                <BulwarkCard padding="md" data-testid="overview-open-items">
                  <BulwarkSectionHeader title="Open items" />
                  <ul v-if="openItems.length" class="flex flex-col divide-y" style="border-color: var(--border-subtle)">
                    <li v-for="it in openItems" :key="it.id" class="flex items-center gap-3 py-2 min-h-12">
                      <BulwarkIcon :name="it.icon" size="sm" />
                      <div class="min-w-0 flex-1">
                        <NuxtLink :to="it.to" class="bw-link font-medium">{{ it.title }}</NuxtLink>
                        <p class="bw-help truncate">{{ it.context }}</p>
                      </div>
                      <span class="bw-chip">{{ it.status.replaceAll('_', ' ') }}</span>
                    </li>
                  </ul>
                  <p v-else class="bw-help">Nothing needs action right now.</p>
                </BulwarkCard>

                <BulwarkCard padding="md" data-testid="overview-programs">
                  <BulwarkSectionHeader title="Programs & progress" />
                  <p v-if="detail.programs.length" class="flex flex-wrap gap-2 mb-3">
                    <BulwarkProgramChip v-for="pr in detail.programs" :key="pr.id" :program="pr" />
                  </p>
                  <BulwarkProgress :value="stageProgress" :label="`${stages.filter((s) => s.done).length} of ${stages.length} stages complete`" />
                  <ol class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                    <li v-for="s in stages" :key="s.label" class="flex items-center gap-2 bw-help">
                      <BulwarkIcon :name="s.done ? 'check-circle' : 'clock'" size="sm" />{{ s.label }}<span class="sr-only">{{ s.done ? ' (done)' : ' (to do)' }}</span>
                    </li>
                  </ol>
                </BulwarkCard>

                <BulwarkCard v-if="depth && depth.buildings.length > 0" padding="md" data-testid="overview-buildings">
                  <BulwarkSectionHeader title="Buildings">
                    <template #actions><NuxtLink :to="`${base}/buildings`" class="bw-link">View all</NuxtLink></template>
                  </BulwarkSectionHeader>
                  <ul class="flex flex-col divide-y" data-testid="overview-buildings-tiles" style="border-color: var(--border-subtle)">
                    <li v-for="b in depth.buildings" :key="b.id" class="py-2">
                      <NuxtLink :to="`${base}/buildings/${b.id}`" class="bw-link font-medium" data-testid="overview-building-tile">{{ b.name }}</NuxtLink>
                      <span class="bw-help"> · {{ [b.kind, b.squareFeet ? `${b.squareFeet} sq ft` : null, b.yearBuilt, `${b.sections.length} section${b.sections.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') }}</span>
                    </li>
                  </ul>
                </BulwarkCard>
              </div>

              <div class="flex flex-col gap-4">
                <BulwarkCard padding="md" data-testid="overview-property-details">
                  <BulwarkSectionHeader title="Details" />
                  <BulwarkKeyValue :items="details" :columns="1" />
                  <p v-if="detail.client" class="mt-2" data-testid="overview-client-name">
                    <NuxtLink :to="`/admin/clients/${detail.client.id}`" class="bw-link">{{ detail.client.fullName }}</NuxtLink>
                  </p>
                  <BulwarkSelect
                    class="mt-3"
                    :model-value="p.assigneeUserId ?? ''"
                    label="Assignee"
                    :options="assigneeOptions"
                    :disabled="readonly"
                    data-testid="hub-assignee"
                    @update:model-value="setAssignee"
                  />
                </BulwarkCard>

                <BulwarkCard v-if="depth?.contacts.find((c) => c.isPrimary)" padding="md" data-testid="overview-primary-contact">
                  <BulwarkSectionHeader title="Primary contact" />
                  <template v-for="c in depth?.contacts ?? []" :key="c.id">
                    <template v-if="c.isPrimary">
                      <p class="font-medium">{{ c.firstName }} {{ c.lastName }}</p>
                      <p class="bw-help">{{ c.email ?? '—' }} · {{ c.phone ?? '—' }}</p>
                    </template>
                  </template>
                </BulwarkCard>

                <BulwarkCard v-if="detail.photos.length || depth?.primaryPhotoUrl" padding="md" data-testid="overview-primary-photo">
                  <BulwarkSectionHeader title="Photos">
                    <template #actions><NuxtLink :to="`${base}/photos`" class="bw-link">View all</NuxtLink></template>
                  </BulwarkSectionHeader>
                  <BulwarkPhotoMosaic
                    v-if="detail.photos.length"
                    :photos="detail.photos.map((ph) => ({ id: ph.id, url: safeUrl(ph.thumbnailUrl ?? ph.url) ?? null, alt: ph.caption, scanStatus: ph.scanStatus }))"
                    :max="6"
                  />
                  <img v-else :src="safeUrl(depth!.primaryPhotoUrl!) ?? ''" alt="Property photo" class="w-full aspect-video object-cover rounded-card" loading="lazy">
                </BulwarkCard>

                <BulwarkCard padding="md" data-testid="overview-activity">
                  <BulwarkSectionHeader title="Recent activity">
                    <template #actions><button type="button" class="bw-link" @click="activeTab = 'activity'">View all</button></template>
                  </BulwarkSectionHeader>
                  <BulwarkTimeline v-if="activity.length" :items="activity" />
                  <p v-else class="bw-help">No activity yet.</p>
                </BulwarkCard>
              </div>
            </section>
          </template>

          <template #tab-inspections>
            <section data-testid="tab-panel-assessment">
              <div v-if="!compliance" class="flex flex-col items-start gap-4">
                <EmptyState icon="·" title="No inspection yet" body="Capture roof, siding, eaves, vents and defensible-space data to evaluate WUI compliance." class="self-stretch" />
                <NuxtLink v-if="!readonly" :to="`${base}/assessment`" class="self-center bw-btn bw-btn--primary" data-testid="tab-start-assessment-cta">Start assessment</NuxtLink>
              </div>
              <div v-else class="flex flex-col gap-4">
                <BulwarkBanner
                  :tone="compliance.overallCompliant ? 'success' : 'danger'"
                  data-testid="assessment-tab-banner"
                  :data-compliant="compliance.overallCompliant ? 'true' : 'false'"
                >
                  <strong>{{ compliance.overallCompliant ? 'Compliant' : 'Non-compliant' }}</strong> —
                  <template v-if="compliance.overallCompliant">all measured fields meet the WUI baseline standards.</template>
                  <template v-else>{{ compliance.requiredUpgrades.length }} item(s) require upgrade.</template>
                </BulwarkBanner>
                <div class="flex items-center gap-4">
                  <NuxtLink :to="`${base}/assessment-summary`" class="bw-link" data-testid="tab-view-summary-link">View full summary</NuxtLink>
                  <NuxtLink v-if="!readonly" :to="`${base}/assessment`" class="bw-link" data-testid="tab-redo-assessment-link">Re-run assessment</NuxtLink>
                </div>
              </div>
            </section>
          </template>

          <template #tab-quotes>
            <section data-testid="tab-panel-quotes" class="flex flex-col gap-4">
              <ul v-if="quotes.length" class="bw-card divide-y" data-testid="property-quotes-list" style="border-color: var(--border-subtle)">
                <li v-for="q in quotes" :key="q.id" class="p-3 md:p-4 flex items-center justify-between gap-3 min-h-14" data-testid="property-quote-row" :data-quote-id="q.id">
                  <div class="min-w-0">
                    <NuxtLink :to="`${base}/quotes/${q.id}`" class="bw-link font-medium">{{ q.quoteNumber }}</NuxtLink>
                    <p class="bw-help tnum">{{ formatCents(q.totals.totalCents) }}</p>
                  </div>
                  <span class="bw-chip">{{ q.status }}</span>
                </li>
              </ul>
              <EmptyState v-else icon="·" title="No quotes yet" body="Build the first quote for this property." class="self-stretch" />
              <NuxtLink v-if="!readonly" :to="`${base}/quotes/new`" class="self-start bw-btn bw-btn--primary" data-testid="tab-new-quote-cta">New quote</NuxtLink>
            </section>
          </template>

          <template #tab-jobs>
            <section data-testid="tab-panel-work-orders" class="flex flex-col gap-4">
              <ul v-if="jobs.length" class="bw-card divide-y" data-testid="property-work-orders-list" style="border-color: var(--border-subtle)">
                <li v-for="w in jobs" :key="w.id" class="p-3 md:p-4 flex items-center justify-between gap-3 min-h-14" data-testid="property-work-order-row" :data-work-order-id="w.id">
                  <div class="min-w-0">
                    <NuxtLink :to="`/admin/work-orders/${w.id}`" class="bw-link font-medium">{{ w.workOrderNumber }}</NuxtLink>
                    <p class="bw-help">{{ w.tradeSlots.length }} trade slot(s){{ w.scheduledStart ? ` · starts ${fmtDate(w.scheduledStart)}` : '' }}</p>
                  </div>
                  <span class="bw-chip">{{ w.status.replaceAll('_', ' ') }}</span>
                </li>
              </ul>
              <EmptyState v-else icon="·" title="No jobs yet" body="Convert an accepted quote into a job to begin scheduling." />
            </section>
          </template>

          <template #tab-invoices>
            <section data-testid="tab-panel-invoices" class="flex flex-col gap-4">
              <ul v-if="invoices.length" class="bw-card divide-y" data-testid="property-invoices-list" style="border-color: var(--border-subtle)">
                <li v-for="inv in invoices" :key="inv.id" class="p-3 md:p-4 flex items-center justify-between gap-3 min-h-14" data-testid="property-invoice-row" :data-invoice-id="inv.id">
                  <div class="min-w-0">
                    <NuxtLink :to="`/admin/invoices/${inv.id}`" class="bw-link font-medium">{{ inv.invoiceNumber }}</NuxtLink>
                    <p class="bw-help tnum">{{ formatCents(inv.totals.totalCents) }}</p>
                  </div>
                  <span class="bw-chip">{{ inv.status }}</span>
                </li>
              </ul>
              <EmptyState v-else icon="·" title="No invoices yet" body="Create an invoice from a completed job." />
            </section>
          </template>

          <template #tab-documents>
            <section data-testid="tab-panel-compliance" class="flex flex-col gap-4">
              <ul v-if="docs.length" class="bw-card divide-y" data-testid="property-compliance-list" style="border-color: var(--border-subtle)">
                <li v-for="doc in docs" :key="doc.id" class="p-3 md:p-4 flex items-center justify-between gap-3 min-h-14" data-testid="property-compliance-row" :data-doc-id="doc.id">
                  <div class="min-w-0">
                    <NuxtLink :to="`${base}/compliance/${doc.id}`" class="bw-link font-medium">Compliance document · {{ fmtDate(doc.createdAt) }}</NuxtLink>
                    <p class="bw-help">Covers {{ doc.workOrderIds.length }} job(s)</p>
                  </div>
                  <span class="bw-chip">{{ doc.status }}</span>
                </li>
              </ul>
              <EmptyState v-else icon="·" title="No documents yet" body="Generate the homeowner- and insurer-facing PDF from completed job trade slots." class="self-stretch" />
              <div class="flex gap-3 flex-wrap">
                <NuxtLink v-if="!readonly" :to="`${base}/compliance/new`" class="bw-btn bw-btn--primary" data-testid="tab-start-compliance-cta">Generate deliverable</NuxtLink>
              </div>
            </section>
          </template>

          <template v-for="sub in (['photos', 'attachments', 'contacts', 'buildings'] as const)" :key="sub" #[`tab-${sub}`]>
            <section :data-testid="`tab-panel-${sub}`" class="flex flex-col gap-3 items-start">
              <p class="bw-help">
                {{ tabs.find((t) => t.value === sub)?.count ?? 0 }} {{ sub }} on this property.
              </p>
              <BulwarkPhotoMosaic
                v-if="sub === 'photos' && detail.photos.length"
                :photos="detail.photos.map((ph) => ({ id: ph.id, url: safeUrl(ph.thumbnailUrl ?? ph.url) ?? null, alt: ph.caption, scanStatus: ph.scanStatus }))"
                :max="12"
              />
              <NuxtLink :to="`${base}/${sub}`" class="bw-btn bw-btn--secondary" :data-depth-tab="sub">Open {{ sub }}</NuxtLink>
            </section>
          </template>

          <template #tab-activity>
            <section data-testid="tab-panel-activity">
              <EmptyState v-if="!detail.timeline.length" icon="·" title="No activity yet" body="Status changes and other events on this property appear here." />
              <ol v-else class="relative border-l ml-3 space-y-4" data-testid="property-activity-timeline" style="border-color: var(--border-default)">
                <li
                  v-for="row in detail.timeline"
                  :key="row.id"
                  class="pl-4 relative"
                  data-testid="property-activity-row"
                  :data-entity-type="row.entityType"
                  :data-entity-id="row.entityId"
                  :data-action="row.action"
                >
                  <span class="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style="background: var(--accent)" aria-hidden="true" />
                  <p class="bw-help"><time :datetime="row.createdAt">{{ new Date(row.createdAt).toLocaleString() }}</time></p>
                  <p>
                    <span class="font-medium">{{ row.entityType.replaceAll('_', ' ') }}</span>
                    · {{ row.action === 'state_change' ? `${statusLabel(String(row.metadata.from ?? ''))} → ${statusLabel(String(row.metadata.to ?? ''))}` : (row.metadata as Record<string, unknown>)?.kind ?? row.action }}
                  </p>
                  <p class="bw-help">by {{ userName(row.actorUserId) }}</p>
                </li>
              </ol>
            </section>
          </template>
        </BulwarkTabs>
        <BulwarkMenu v-if="tabs.length > 8 || narrow" :items="moreItems" label="All sections" align="end" @select="(it: MenuEntry) => (activeTab = it.value as TabKey)">
          <template #trigger="{ toggle, attrs }">
            <button type="button" class="bw-btn bw-btn--ghost bw-btn--sm mb-1 shrink-0" v-bind="attrs" data-testid="hub-more-tabs" @click="toggle">
              More <BulwarkIcon name="chevron-down" size="sm" />
            </button>
          </template>
        </BulwarkMenu>
      </div>

      <BulwarkModal :open="resumeOpen" :title="isHold ? 'Resume work?' : 'Reopen property?'" size="sm" @close="resumeOpen = false">
        <p>Moves {{ p.addressLine1 }} from {{ statusLabel(p.status) }} to {{ resumeTarget ? statusLabel(resumeTarget) : '' }}.</p>
        <template #footer>
          <BulwarkButton variant="secondary" @click="resumeOpen = false">Cancel</BulwarkButton>
          <BulwarkButton data-testid="resume-confirm" @click="resume">{{ isHold ? 'Resume' : 'Reopen' }}</BulwarkButton>
        </template>
      </BulwarkModal>

      <div
        v-if="narrow && !readonly"
        class="fixed bottom-0 inset-x-0 flex gap-2 p-3 border-t"
        style="background: var(--bg-surface); border-color: var(--border-subtle); z-index: var(--z-sticky, 20)"
      >
        <NuxtLink :to="`${base}/quotes/new`" class="bw-btn bw-btn--secondary flex-1 justify-center min-h-12">New quote</NuxtLink>
        <NuxtLink v-if="!isHold" :to="`${base}/work-orders/new`" class="bw-btn bw-btn--primary flex-1 justify-center min-h-12">New job</NuxtLink>
      </div>
    </template>
  </div>
</template>
