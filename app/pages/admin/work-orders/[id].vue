<!--
  app/pages/admin/work-orders/[id].vue — work-order detail (E6-S1).

  # Decisions (ADR-0008)
    - Single page that surfaces the three things Drew + the field crew
      need: trades + assignments, schedule window, materials list. Each
      block is its own card so future stories (E6-S3 sub assignment,
      E6-S4 progress updater) can drop in without restructuring.
    - `useAsyncData(\u2026 { server: false })` matches the rest of E5/E6: the
      seed fixture lives in the same module instance the client mutates,
      so client-only fetch keeps reads consistent with writes.
    - We render trade slots in a vertical card stack on mobile and a
      table-like grid on \u2265md, mirroring the quote builder.
    - The `assigned subcontractor` rendering is purely informational in
      S1 \u2014 the editable assignment lands in E6-S3.

  # Decision cast down
    - Rejected: a tabbed layout. The page is short enough on a phone
      that one scroll covers everything; tabs would just hide context.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import type {
  WorkOrder,
  WorkOrderStatus,
  TradeSlotStatus,
  WorkOrderPriority,
} from '~~/shared/contracts/work-order'
import { TRADE_LABEL, type Subcontractor } from '~~/shared/contracts/subcontractor'
import type { ChangeOrder } from '~~/shared/contracts/change-order'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Work order' })

const route = useRoute()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const workOrder = useService('workOrder')
const property = useService('property')
const subcontractor = useService('subcontractor')
const changeOrder = useService('changeOrder')
const { success: toastSuccess } = useToast()

// EH-B / W1-2 pilot: resolve trade names through the label registry so
// admin renames on /settings/labels propagate to this surface. See
// ADR-0014 (we deliberately pilot useLabel on ≥2 surfaces — status badge
// and this trade chip — before rolling it across the app in Wave 2).
const { t: tLabel } = useLabel()
function tradeLabel(trade: keyof typeof TRADE_LABEL): string {
  return tLabel('trade', trade, TRADE_LABEL[trade])
}

const workOrderId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle, refresh } = await useAsyncData(
  () => `work-order-detail-${workOrderId.value}-${orgId.value}`,
  async () => {
    const wo = await workOrder.get(workOrderId.value, orgId.value)
    if (!wo) return {
      workOrder: null,
      property: null,
      subs: new Map<string, Subcontractor>(),
      changeOrders: [] as ChangeOrder[],
    }
    const [prop, subList, coList] = await Promise.all([
      property.get(wo.propertyId, orgId.value),
      subcontractor.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      changeOrder.list({
        organizationId: orgId.value,
        workOrderId: wo.id,
        page: 1,
        pageSize: 100,
      }),
    ])
    const subs = new Map<string, Subcontractor>(
      subList.rows.map((s) => [s.id, s] as const),
    )
    return { workOrder: wo, property: prop, subs, changeOrders: coList.rows }
  },
  { server: false, watch: [workOrderId, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const STATUS_TONE: Record<WorkOrderStatus, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  scheduled: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  cancelled: 'bg-status-error/10 text-status-error',
}

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const SLOT_TONE: Record<TradeSlotStatus, string> = {
  unassigned: 'bg-surface-muted text-text-secondary',
  assigned: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  blocked: 'bg-status-error/10 text-status-error',
}

const SLOT_LABEL: Record<TradeSlotStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

function formatScheduleWindow(w: WorkOrder | null): string {
  if (!w?.scheduledStart || !w?.scheduledEnd) return 'Not scheduled'
  const start = new Date(w.scheduledStart)
  const end = new Date(w.scheduledEnd)
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${fmt.format(start)} \u2192 ${fmt.format(end)}`
}

function subDisplay(slotSubId: string | null): string {
  if (!slotSubId) return 'Unassigned'
  const sub = bundle.value?.subs.get(slotSubId)
  return sub ? sub.companyName : 'Unknown sub'
}

// E6-S3 -------- Sub assignment picker ------------------------------
const pickerOpen = ref(false)
const pickerSlotId = ref<string | null>(null)
const pickerError = ref('')
const pickerBusy = ref(false)

const pickerSlot = computed(() =>
  bundle.value?.workOrder?.tradeSlots.find((s) => s.id === pickerSlotId.value) ??
  null,
)

const pickerCandidates = computed<Subcontractor[]>(() => {
  if (!pickerSlot.value || !bundle.value) return []
  const trade = pickerSlot.value.trade
  return Array.from(bundle.value.subs.values())
    .filter((s) => s.trades.includes(trade))
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
})

function openPicker(slotId: string) {
  pickerSlotId.value = slotId
  pickerError.value = ''
  pickerOpen.value = true
}

async function chooseSub(subId: string | null) {
  if (!bundle.value?.workOrder || !pickerSlotId.value) return
  pickerError.value = ''
  pickerBusy.value = true
  try {
    await workOrder.assignTrade(
      bundle.value.workOrder.id,
      pickerSlotId.value,
      subId,
      orgId.value,
    )
    await refresh()
    toastSuccess(
      subId ? 'Subcontractor assigned' : 'Assignment cleared',
      subId ? 'Crew is on the job.' : 'Slot is unassigned.',
    )
    pickerOpen.value = false
    pickerSlotId.value = null
  } catch (err: unknown) {
    pickerError.value =
      err instanceof Error ? err.message : 'Could not update assignment.'
  } finally {
    pickerBusy.value = false
  }
}

// E6-S4 -------- Per-slot progress updater --------------------------
const progressBusySlot = ref<string | null>(null)
const progressError = ref('')

async function onProgressUpdate(slotId: string, next: TradeSlotStatus) {
  if (!bundle.value?.workOrder) return
  progressError.value = ''
  progressBusySlot.value = slotId
  try {
    await workOrder.updateTradeStatus(
      bundle.value.workOrder.id,
      slotId,
      next,
      orgId.value,
    )
    await refresh()
    toastSuccess('Progress updated', `Slot is now ${next.replace('_', ' ')}.`)
  } catch (err: unknown) {
    progressError.value =
      err instanceof Error ? err.message : 'Could not update progress.'
  } finally {
    progressBusySlot.value = null
  }
}

// W2-3b / EH-G ---------- Schedule + priority + hours ----------------
const PRIORITY_OPTIONS: { value: WorkOrderPriority; label: string }[] = [
  { value: 'low', label: tLabel('work-order.priority', 'low', 'Low') },
  { value: 'normal', label: tLabel('work-order.priority', 'normal', 'Normal') },
  { value: 'high', label: tLabel('work-order.priority', 'high', 'High') },
  { value: 'urgent', label: tLabel('work-order.priority', 'urgent', 'Urgent') },
]
const PRIORITY_TONE: Record<WorkOrderPriority, string> = {
  low: 'bg-surface-muted text-text-secondary',
  normal: 'bg-status-info/10 text-status-info',
  high: 'bg-status-warning/10 text-status-warning',
  urgent: 'bg-status-error/10 text-status-error',
}
function priorityCopy(p: WorkOrderPriority): string {
  return tLabel('work-order.priority', p, p)
}

const scheduledStartInput = ref('')
const scheduledEndInput = ref('')
const priorityInput = ref<WorkOrderPriority>('normal')
const estimatedHoursInput = ref<number>(0)
const scheduleBusy = ref(false)
const scheduleError = ref('')

// Convert ISO → datetime-local "yyyy-MM-ddTHH:mm".
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

watch(
  () => bundle.value?.workOrder,
  (wo) => {
    if (!wo) return
    scheduledStartInput.value = isoToLocalInput(wo.scheduledStart)
    scheduledEndInput.value = isoToLocalInput(wo.scheduledEnd)
    priorityInput.value = (wo.priority ?? 'normal') as WorkOrderPriority
    estimatedHoursInput.value = wo.estimatedHours ?? 0
  },
  { immediate: true },
)

async function saveSchedule() {
  if (!bundle.value?.workOrder) return
  scheduleError.value = ''
  scheduleBusy.value = true
  try {
    await workOrder.schedule({
      workOrderId: bundle.value.workOrder.id,
      organizationId: orgId.value,
      scheduledStart: localInputToIso(scheduledStartInput.value),
      scheduledEnd: localInputToIso(scheduledEndInput.value),
    })
    await refresh()
    toastSuccess('Schedule saved', 'Dispatch board updated.')
  } catch (err: unknown) {
    scheduleError.value =
      err instanceof Error ? err.message : 'Could not save schedule.'
  } finally {
    scheduleBusy.value = false
  }
}

// Slot Start / Complete --------------------------------------------
const slotBusy = ref<string | null>(null)
async function startSlot(slotId: string) {
  if (!bundle.value?.workOrder) return
  slotBusy.value = slotId
  try {
    await workOrder.startSlot({
      workOrderId: bundle.value.workOrder.id,
      tradeSlotId: slotId,
      organizationId: orgId.value,
    })
    await refresh()
    toastSuccess('Slot started', 'Stamped actualStart.')
  } catch (err: unknown) {
    progressError.value = err instanceof Error ? err.message : 'Could not start.'
  } finally {
    slotBusy.value = null
  }
}

const completeOpen = ref(false)
const completeSlotId = ref<string | null>(null)
const completeHours = ref<number>(0)
const completeNotes = ref('')
function openComplete(slotId: string) {
  completeSlotId.value = slotId
  const slot = bundle.value?.workOrder?.tradeSlots.find((s) => s.id === slotId)
  completeHours.value = slot?.estimatedHours ?? 0
  completeNotes.value = ''
  completeOpen.value = true
}
async function submitComplete() {
  if (!bundle.value?.workOrder || !completeSlotId.value) return
  slotBusy.value = completeSlotId.value
  try {
    await workOrder.completeSlot({
      workOrderId: bundle.value.workOrder.id,
      tradeSlotId: completeSlotId.value,
      organizationId: orgId.value,
      actualHours: completeHours.value,
      notes: completeNotes.value.trim() || null,
    })
    await refresh()
    toastSuccess('Slot completed', 'Actual hours recorded.')
    completeOpen.value = false
    completeSlotId.value = null
  } catch (err: unknown) {
    progressError.value = err instanceof Error ? err.message : 'Could not complete.'
  } finally {
    slotBusy.value = null
  }
}

// Cost rollup -------------------------------------------------------
const rollup = computed(() => {
  const wo = bundle.value?.workOrder
  if (!wo) return { estimatedHours: 0, actualHours: 0, varianceHours: 0 }
  const est = (wo.tradeSlots ?? []).reduce(
    (a, s) => a + (s.estimatedHours ?? 0),
    0,
  )
  const act = (wo.tradeSlots ?? []).reduce(
    (a, s) => a + (s.actualHours ?? 0),
    0,
  )
  return { estimatedHours: est, actualHours: act, varianceHours: act - est }
})

// Change orders -----------------------------------------------------
const coProposeOpen = ref(false)
const coTitle = ref('')
const coDescription = ref('')
const coAmount = ref<number>(0)
const coBusy = ref(false)
const coError = ref('')

function openProposeCO() {
  coTitle.value = ''
  coDescription.value = ''
  coAmount.value = 0
  coError.value = ''
  coProposeOpen.value = true
}

async function submitProposeCO() {
  if (!bundle.value?.workOrder) return
  coError.value = ''
  coBusy.value = true
  try {
    await changeOrder.propose({
      organizationId: orgId.value,
      workOrderId: bundle.value.workOrder.id,
      invoiceId: null,
      title: coTitle.value.trim(),
      description: coDescription.value.trim() || coTitle.value.trim(),
      amountCents: Math.round(coAmount.value * 100),
      proposedByUserId: session.value?.userId ?? null,
    })
    await refresh()
    toastSuccess('Change order proposed', 'Awaiting approval.')
    coProposeOpen.value = false
  } catch (err: unknown) {
    coError.value = err instanceof Error ? err.message : 'Could not propose.'
  } finally {
    coBusy.value = false
  }
}

async function approveCO(id: string) {
  coBusy.value = true
  try {
    await changeOrder.approve({
      id,
      organizationId: orgId.value,
      approvedByName: session.value?.fullName ?? 'Admin',
      signatureUrl: null,
    })
    await refresh()
    toastSuccess('Change order approved', 'Applied.')
  } catch (err: unknown) {
    coError.value = err instanceof Error ? err.message : 'Could not approve.'
  } finally {
    coBusy.value = false
  }
}
async function rejectCO(id: string) {
  coBusy.value = true
  try {
    await changeOrder.reject({
      id,
      organizationId: orgId.value,
      reason: 'Declined by admin',
    })
    await refresh()
    toastSuccess('Change order rejected', 'No changes applied.')
  } catch (err: unknown) {
    coError.value = err instanceof Error ? err.message : 'Could not reject.'
  } finally {
    coBusy.value = false
  }
}
</script>

<template>
  <div
    class="p-4 md:p-6 max-w-4xl mx-auto"
    data-testid="work-order-detail"
    :data-property-id="bundle?.workOrder?.propertyId"
  >
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        bundle?.workOrder
          ? { label: bundle.property?.addressLine1 ?? 'Property', to: `/admin/properties/${bundle.workOrder.propertyId}` }
          : { label: 'Work orders', to: '/admin/work-orders' },
        { label: bundle?.workOrder?.workOrderNumber ?? 'Work order' },
      ]"
    />

    <div v-if="!bundle?.workOrder" class="mt-6">
      <EmptyState
        icon="·"
        title="Work order not found"
        body="It may have been cancelled, deleted, or belongs to another organization."
        :cta="{ label: 'Back to work orders', to: '/admin/work-orders' }"
        data-testid="work-order-not-found"
      />
    </div>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-display" data-testid="work-order-number">
            {{ bundle.workOrder.workOrderNumber }}
          </h1>
          <p v-if="propertyAddress" class="text-body text-text-secondary mt-1">
            {{ propertyAddress }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <NuxtLink
            v-if="bundle.workOrder.status !== 'cancelled'"
            :to="`/admin/properties/${bundle.workOrder.propertyId}/invoices/new?workOrderId=${bundle.workOrder.id}`"
            class="text-small text-primary-700 hover:text-primary underline"
            data-testid="create-invoice-cta"
          >
            Create invoice
          </NuxtLink>
          <span
            :class="[
              'inline-flex items-center rounded-pill px-3 py-1 text-small font-medium whitespace-nowrap',
              STATUS_TONE[bundle.workOrder.status],
            ]"
            data-testid="work-order-status"
            :data-status="bundle.workOrder.status"
          >
            {{ STATUS_LABEL[bundle.workOrder.status] }}
          </span>
        </div>
      </header>

      <!-- Schedule window ---------------------------------------- -->
      <!-- EH-D / W1-4: Linked work sidebar so the operator can hop
           back to the property hub or jump to the originating quote
           without searching. Invoice + compliance links are stubs for
           now (no listing lookup wired) — see W1-4 handoff. -->
      <BulwarkCard padding="md" class="mt-6" data-testid="work-order-linked">
        <h2 class="text-h2 mb-2">Linked work</h2>
        <ul class="text-body space-y-1">
          <li>
            Property:
            <NuxtLink
              :to="`/admin/properties/${bundle.workOrder.propertyId}`"
              class="text-primary hover:underline"
              data-testid="link-to-property"
            >
              {{ bundle.property?.addressLine1 ?? 'View property' }}
            </NuxtLink>
          </li>
          <li>
            Source quote:
            <NuxtLink
              :to="`/admin/properties/${bundle.workOrder.propertyId}/quotes/${bundle.workOrder.quoteId}`"
              class="text-primary hover:underline"
              data-testid="link-to-source-quote"
            >
              View quote
            </NuxtLink>
          </li>
        </ul>
      </BulwarkCard>

      <BulwarkCard padding="md" class="mt-6" data-testid="work-order-schedule">
        <h2 class="text-h2 mb-2">Schedule</h2>
        <p class="text-body" data-testid="schedule-window">
          {{ formatScheduleWindow(bundle.workOrder) }}
        </p>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <BulwarkInput
            v-model="scheduledStartInput"
            type="datetime-local"
            label="Scheduled start"
            data-testid="schedule-start-input"
          />
          <BulwarkInput
            v-model="scheduledEndInput"
            type="datetime-local"
            label="Scheduled end"
            data-testid="schedule-end-input"
          />
          <BulwarkSelect
            v-model="priorityInput"
            label="Priority"
            :options="PRIORITY_OPTIONS"
            data-testid="priority-select"
          />
          <BulwarkInput
            v-model.number="estimatedHoursInput"
            type="number"
            inputmode="decimal"
            label="Estimated hours"
            data-testid="estimated-hours-input"
          />
        </div>
        <div class="mt-3 flex items-center justify-between gap-2">
          <span
            class="inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium"
            :class="PRIORITY_TONE[priorityInput]"
            data-testid="priority-chip"
            :data-priority="priorityInput"
          >
            {{ priorityCopy(priorityInput) }}
          </span>
          <BulwarkButton
            type="button"
            variant="primary"
            :disabled="scheduleBusy"
            data-testid="save-schedule-button"
            @click="saveSchedule"
          >
            {{ scheduleBusy ? 'Saving…' : 'Save schedule' }}
          </BulwarkButton>
        </div>
        <p
          v-if="scheduleError"
          class="mt-2 text-small text-status-error"
          data-testid="schedule-error"
        >{{ scheduleError }}</p>
      </BulwarkCard>

      <!-- Cost rollup (W2-3b) ----------------------------------- -->
      <BulwarkCard padding="md" class="mt-6" data-testid="cost-rollup">
        <h2 class="text-h2 mb-2">Cost rollup</h2>
        <dl class="grid grid-cols-3 gap-3 text-body">
          <div>
            <dt class="text-text-secondary text-small">Estimated hrs</dt>
            <dd data-testid="rollup-estimated">{{ rollup.estimatedHours }}</dd>
          </div>
          <div>
            <dt class="text-text-secondary text-small">Actual hrs</dt>
            <dd data-testid="rollup-actual">{{ rollup.actualHours }}</dd>
          </div>
          <div>
            <dt class="text-text-secondary text-small">Variance</dt>
            <dd
              :class="rollup.varianceHours > 0 ? 'text-status-warning' : 'text-status-success'"
              data-testid="rollup-variance"
            >{{ rollup.varianceHours > 0 ? '+' : '' }}{{ rollup.varianceHours }}</dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Trade slots -------------------------------------------- -->
      <section class="mt-6" data-testid="trade-slots">
        <h2 class="text-h2 mb-2">Trades</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="slot in bundle.workOrder.tradeSlots"
              :key="slot.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="trade-slot"
              :data-trade="slot.trade"
              :data-slot-id="slot.id"
            >
              <div class="md:col-span-4">
                <p class="text-body font-medium text-text-primary" data-testid="trade-slot-trade">
                  {{ tradeLabel(slot.trade) }}
                </p>
                <p class="text-small text-text-secondary">
                  {{ slot.description }}
                </p>
              </div>
              <div class="md:col-span-4 flex flex-wrap items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Sub</span>
                <span class="text-body" data-testid="trade-slot-sub">
                  {{ subDisplay(slot.assignedSubcontractorId) }}
                </span>
                <button
                  type="button"
                  class="text-small text-primary-700 hover:text-primary underline"
                  data-testid="assign-sub-button"
                  @click="openPicker(slot.id)"
                >
                  {{ slot.assignedSubcontractorId ? 'Change' : 'Assign' }}
                </button>
              </div>
              <div class="md:col-span-4 flex md:justify-end items-center">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium whitespace-nowrap',
                    SLOT_TONE[slot.status],
                  ]"
                  data-testid="trade-slot-status"
                  :data-status="slot.status"
                >
                  {{ SLOT_LABEL[slot.status] }}
                </span>
              </div>
              <div class="md:col-span-12">
                <JobProgressUpdater
                  :status="slot.status"
                  :has-assignment="slot.assignedSubcontractorId !== null"
                  :busy="progressBusySlot === slot.id"
                  @update="(next) => onProgressUpdate(slot.id, next)"
                />
              </div>
              <!-- W2-3b: slot scheduled window + Start/Complete ----- -->
              <div class="md:col-span-12 flex flex-wrap items-center gap-3 text-small text-text-secondary">
                <span data-testid="slot-window">
                  <template v-if="slot.scheduledStart">
                    {{ new Date(slot.scheduledStart).toLocaleString() }}
                    <span v-if="slot.scheduledEnd"> → {{ new Date(slot.scheduledEnd).toLocaleString() }}</span>
                  </template>
                  <template v-else>No slot schedule</template>
                </span>
                <span v-if="slot.estimatedHours" data-testid="slot-estimated-hours">
                  Est. {{ slot.estimatedHours }}h
                </span>
                <span v-if="slot.actualHours" data-testid="slot-actual-hours">
                  Actual {{ slot.actualHours }}h
                </span>
                <span class="flex-1" />
                <BulwarkButton
                  v-if="slot.status === 'assigned'"
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="slotBusy === slot.id"
                  data-testid="slot-start-button"
                  @click="startSlot(slot.id)"
                >
                  Start
                </BulwarkButton>
                <BulwarkButton
                  v-if="slot.status === 'in_progress'"
                  type="button"
                  variant="primary"
                  size="sm"
                  :disabled="slotBusy === slot.id"
                  data-testid="slot-complete-button"
                  @click="openComplete(slot.id)"
                >
                  Complete
                </BulwarkButton>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Materials ---------------------------------------------- -->
      <section
        v-if="bundle.workOrder.materials.length > 0"
        class="mt-6"
        data-testid="materials"
      >
        <h2 class="text-h2 mb-2">Materials</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="m in bundle.workOrder.materials"
              :key="m.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="material-row"
            >
              <div class="md:col-span-7">
                <p class="text-body font-medium text-text-primary">{{ m.name }}</p>
              </div>
              <div class="md:col-span-2 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Qty</span>
                <span class="text-body">{{ m.quantity }} {{ m.unit }}</span>
              </div>
              <div class="md:col-span-3 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Unit</span>
                <span class="text-body">{{ formatCents(m.unitCostCents) }}</span>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Notes ------------------------------------------------- -->
      <section v-if="bundle.workOrder.notes" class="mt-6" data-testid="work-order-notes">
        <h2 class="text-h2 mb-2">Notes</h2>
        <BulwarkCard padding="md">
          <p class="text-body whitespace-pre-line">{{ bundle.workOrder.notes }}</p>
        </BulwarkCard>
      </section>

      <!-- Change Orders panel (W2-3b) -------------------------- -->
      <section class="mt-6" data-testid="change-orders-panel">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-h2">Change orders</h2>
          <BulwarkButton
            type="button"
            variant="secondary"
            data-testid="propose-co-button"
            @click="openProposeCO"
          >
            + Propose change order
          </BulwarkButton>
        </div>
        <BulwarkCard padding="none">
          <ul
            v-if="(bundle.changeOrders ?? []).length > 0"
            class="divide-y divide-border-default"
          >
            <li
              v-for="co in bundle.changeOrders"
              :key="co.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
              data-testid="change-order-row"
              :data-co-id="co.id"
              :data-status="co.status"
            >
              <div class="md:col-span-6">
                <p class="text-body font-medium" data-testid="co-title">{{ co.title }}</p>
                <p class="text-small text-text-secondary whitespace-pre-line">{{ co.description }}</p>
              </div>
              <div class="md:col-span-2 text-body">{{ formatCents(co.amountCents) }}</div>
              <div class="md:col-span-2 text-small">
                <span
                  :class="[
                    'inline-flex items-center rounded-pill px-2 py-0.5 text-tiny font-medium',
                    co.status === 'approved' ? 'bg-status-success/10 text-status-success'
                      : co.status === 'rejected' ? 'bg-status-error/10 text-status-error'
                      : 'bg-status-info/10 text-status-info',
                  ]"
                >{{ co.status }}</span>
              </div>
              <div class="md:col-span-2 flex gap-2 justify-end">
                <BulwarkButton
                  v-if="co.status === 'proposed'"
                  type="button"
                  variant="primary"
                  size="sm"
                  :disabled="coBusy"
                  data-testid="approve-co-button"
                  @click="approveCO(co.id)"
                >Approve</BulwarkButton>
                <BulwarkButton
                  v-if="co.status === 'proposed'"
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="coBusy"
                  data-testid="reject-co-button"
                  @click="rejectCO(co.id)"
                >Reject</BulwarkButton>
              </div>
            </li>
          </ul>
          <div v-else class="p-4 text-small text-text-secondary" data-testid="change-orders-empty">
            No change orders yet.
          </div>
        </BulwarkCard>
        <p v-if="coError" class="mt-2 text-small text-status-error" data-testid="co-error">{{ coError }}</p>
      </section>
    </template>

    <!-- Sub-assignment picker (E6-S3) ----------------------- -->
    <BulwarkModal
      v-model="pickerOpen"
      :title="pickerSlot ? `Assign ${tradeLabel(pickerSlot.trade)}` : 'Assign subcontractor'"
      size="md"
    >
      <div data-testid="assign-sub-modal">
        <p
          v-if="pickerCandidates.length === 0"
          class="text-body text-text-secondary"
          data-testid="assign-no-candidates"
        >
          No subcontractors are registered for this trade yet. Add one
          on the Subcontractors page.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="sub in pickerCandidates"
            :key="sub.id"
            data-testid="assign-candidate"
            :data-sub-id="sub.id"
          >
            <button
              type="button"
              class="w-full text-left rounded-card border border-border-default p-3 hover:bg-surface-muted disabled:opacity-50"
              :disabled="pickerBusy"
              data-testid="assign-candidate-button"
              @click="chooseSub(sub.id)"
            >
              <p class="text-body font-medium text-text-primary">
                {{ sub.companyName }}
              </p>
              <p class="text-small text-text-secondary">
                {{ sub.contactName }} · {{ sub.phone }}
              </p>
            </button>
          </li>
        </ul>
        <p
          v-if="pickerError"
          class="mt-3 text-small text-status-error"
          data-testid="assign-error"
        >
          {{ pickerError }}
        </p>
      </div>
      <template #footer>
        <BulwarkButton
          v-if="pickerSlot?.assignedSubcontractorId"
          type="button"
          variant="secondary"
          :disabled="pickerBusy"
          data-testid="assign-clear-button"
          @click="chooseSub(null)"
        >
          Clear assignment
        </BulwarkButton>
        <BulwarkButton
          type="button"
          variant="secondary"
          :disabled="pickerBusy"
          data-testid="assign-cancel-button"
          @click="pickerOpen = false"
        >
          Cancel
        </BulwarkButton>
      </template>
    </BulwarkModal>

    <!-- Complete-slot modal (W2-3b) ------------------------------- -->
    <BulwarkModal v-model="completeOpen" title="Complete slot" size="md">
      <div data-testid="complete-slot-modal" class="flex flex-col gap-3">
        <BulwarkInput
          v-model.number="completeHours"
          type="number"
          inputmode="decimal"
          label="Actual hours"
          data-testid="complete-hours-input"
        />
        <BulwarkTextarea
          v-model="completeNotes"
          label="Notes"
          :rows="3"
          data-testid="complete-notes-input"
        />
      </div>
      <template #footer>
        <BulwarkButton
          type="button"
          variant="secondary"
          @click="completeOpen = false"
        >Cancel</BulwarkButton>
        <BulwarkButton
          type="button"
          variant="primary"
          :disabled="slotBusy !== null"
          data-testid="complete-submit-button"
          @click="submitComplete"
        >Complete</BulwarkButton>
      </template>
    </BulwarkModal>

    <!-- Propose change-order modal (W2-3b) ------------------------ -->
    <BulwarkModal v-model="coProposeOpen" title="Propose change order" size="md">
      <div data-testid="propose-co-modal" class="flex flex-col gap-3">
        <BulwarkInput
          v-model="coTitle"
          label="Title"
          data-testid="co-title-input"
        />
        <BulwarkTextarea
          v-model="coDescription"
          label="Description"
          :rows="3"
          data-testid="co-description-input"
        />
        <BulwarkInput
          v-model.number="coAmount"
          type="number"
          inputmode="decimal"
          label="Amount ($)"
          data-testid="co-amount-input"
        />
      </div>
      <template #footer>
        <BulwarkButton
          type="button"
          variant="secondary"
          @click="coProposeOpen = false"
        >Cancel</BulwarkButton>
        <BulwarkButton
          type="button"
          variant="primary"
          :disabled="coBusy || !coTitle.trim()"
          data-testid="co-submit-button"
          @click="submitProposeCO"
        >{{ coBusy ? 'Saving…' : 'Propose' }}</BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
