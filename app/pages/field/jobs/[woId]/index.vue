<!--
  app/pages/field/jobs/[woId].vue — Field job detail (W3-3 / EH-M /
  ADR-0029).

  # What this is
    A field-styled work-order summary with three primary actions
    surfaced as fat buttons: Check in (geolocation → audit row),
    Add photos (camera capture), Inspect (route to the field-styled
    inspection form). Slot list re-uses the same data the admin WO
    detail reads but with a touch-friendly start/complete pair.

  # Decisions (ADR-0008)
    - We DO NOT call the admin work-order actions (assignTrade,
      schedule, etc.) — those are admin-only concerns. The field crew
      can only progress a slot (`startSlot` / `completeSlot`) per the
      W2-3 contract.
    - Maps deep-link picks Apple Maps on iOS (UA sniff) and Google
      Maps elsewhere. Both schemes are safe fallbacks for cleared
      external browsers.
    - Geolocation is captured via `navigator.geolocation` with a 10s
      timeout. On denial we surface a toast and leave the audit
      unwritten. The check-in POST is routed through `useOfflineQueue`
      so the crew can record their arrival even with no signal — the
      drain replays once they're online.

  # Decision cast down
    - Rejected: a one-tap "Start work" that combines check-in + start
      first slot. The audit log is much clearer when each transition
      is its own row.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import type { WorkOrder } from '~~/shared/contracts/work-order'
import type { Property } from '~~/shared/contracts/property'
import type { AuditLogRow } from '~~/shared/contracts/audit'

definePageMeta({
  layout: 'field',
  middleware: 'field-role',
  fieldTitle: 'Job',
})

const route = useRoute()
const woId = computed(() => route.params.woId as string)

const { t } = useLabel()
const toast = useToast()
const { session, ensureLoaded } = useSession()
await ensureLoaded()
if (!session.value) throw createError({ statusCode: 401 })
const orgId = session.value.activeOrganizationId

const workOrderService = useService('workOrder')
const propertyService = useService('property')

const wo = ref<WorkOrder | null>(null)
const property = ref<Property | null>(null)
const checkIns = ref<AuditLogRow[]>([])
const loading = ref(true)
const checkingIn = ref(false)

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    wo.value = await workOrderService.get(woId.value, orgId)
    if (wo.value) {
      property.value = await propertyService.get(wo.value.propertyId, orgId)
    }
    const res = await $fetch<{ rows: AuditLogRow[] }>('/api/field/check-ins', {
      query: { workOrderId: woId.value },
    })
    checkIns.value = res.rows
  } finally {
    loading.value = false
  }
}
await loadAll()

useHead({ title: () => wo.value?.workOrderNumber ?? 'Job' })

const mapsHref = computed(() => {
  const p = property.value
  if (!p) return '#'
  const addr = encodeURIComponent(`${p.addressLine1}, ${p.city}, ${p.state} ${p.postalCode}`)
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Mac/i.test(navigator.userAgent)) {
    return `https://maps.apple.com/?q=${addr}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${addr}`
})

const lastCheckInKind = computed<'in' | 'out' | null>(() => {
  const last = checkIns.value[0]
  if (!last) return null
  const kind = (last.metadata as { kind?: string }).kind
  return kind === 'field.check_in' ? 'in' : kind === 'field.check_out' ? 'out' : null
})

const nextKind = computed<'in' | 'out'>(() => (lastCheckInKind.value === 'in' ? 'out' : 'in'))

const offline = useOfflineQueue({ namespace: 'field-check-in' })

async function captureCheckIn(): Promise<void> {
  if (!wo.value) return
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    toast.error('Geolocation not supported on this device.')
    return
  }
  checkingIn.value = true
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      })
    })
    const body = {
      workOrderId: wo.value.id,
      propertyId: wo.value.propertyId,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      kind: nextKind.value,
    }
    if (!navigator.onLine) {
      offline.enqueue({ url: '/api/field/check-in', method: 'POST', body })
      toast.info('Check-in queued', 'Will sync when online.')
    } else {
      await $fetch('/api/field/check-in', { method: 'POST', body })
      toast.success(nextKind.value === 'in' ? 'Checked in.' : 'Checked out.')
    }
    await loadAll()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Check-in failed.'
    toast.error(msg)
  } finally {
    checkingIn.value = false
  }
}

async function progressSlot(slotId: string, action: 'start' | 'complete'): Promise<void> {
  if (!wo.value) return
  try {
    if (action === 'start') {
      wo.value = await workOrderService.startSlot({
        workOrderId: wo.value.id,
        tradeSlotId: slotId,
        organizationId: orgId,
      })
    } else {
      wo.value = await workOrderService.completeSlot({
        workOrderId: wo.value.id,
        tradeSlotId: slotId,
        organizationId: orgId,
        actualHours: 0,
        notes: null,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Slot update failed.'
    toast.error(msg)
  }
}

onMounted(() => {
  offline.attachOnlineListener()
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-job-detail">
    <header v-if="wo">
      <p class="text-tiny uppercase text-text-secondary">{{ wo.workOrderNumber }}</p>
      <h1 class="text-display mt-1" data-testid="field-job-title">
        {{ property?.addressLine1 ?? 'Job' }}
      </h1>
      <p v-if="property" class="text-small text-text-secondary mt-1">
        {{ property.city }}, {{ property.state }} {{ property.postalCode }}
      </p>
      <a
        v-if="property"
        :href="mapsHref"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 mt-2 text-small font-semibold text-primary min-h-tap"
        data-testid="field-job-maps-link"
      >
        Open in maps ›
      </a>
    </header>

    <section class="mt-4 grid grid-cols-3 gap-2">
      <button
        type="button"
        class="min-h-tap rounded-card bg-primary text-white text-small font-semibold disabled:opacity-50"
        data-testid="field-job-check-in"
        :disabled="checkingIn"
        @click="captureCheckIn"
      >
        {{ t('field.check-in', nextKind, nextKind === 'in' ? 'Check in' : 'Check out') }}
      </button>
      <NuxtLink
        :to="`/field/jobs/${woId}/photos`"
        class="min-h-tap inline-flex items-center justify-center rounded-card bg-surface border border-border text-small font-semibold"
        data-testid="field-job-photos"
      >
        Photos
      </NuxtLink>
      <NuxtLink
        :to="`/field/jobs/${woId}/inspect`"
        class="min-h-tap inline-flex items-center justify-center rounded-card bg-surface border border-border text-small font-semibold"
        data-testid="field-job-inspect"
      >
        Inspect
      </NuxtLink>
    </section>

    <section v-if="wo" class="mt-6">
      <h2 class="text-body font-semibold">Slots</h2>
      <ul class="mt-2 flex flex-col gap-2" data-testid="field-job-slots">
        <li
          v-for="slot in wo.tradeSlots"
          :key="slot.id"
          class="bg-surface border border-border rounded-card p-3 flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <p class="text-small font-semibold truncate">
              {{ t('trade', slot.trade, slot.trade) }}
            </p>
            <p class="text-tiny text-text-secondary truncate">{{ slot.description }}</p>
            <p class="text-tiny text-text-secondary mt-1">
              {{ t('status.work_order.slot', slot.status, slot.status) }}
            </p>
          </div>
          <button
            v-if="slot.status === 'assigned'"
            type="button"
            class="min-h-tap px-3 rounded-input bg-primary text-white text-small"
            data-testid="field-job-slot-start"
            @click="() => progressSlot(slot.id, 'start')"
          >
            Start
          </button>
          <button
            v-else-if="slot.status === 'in_progress'"
            type="button"
            class="min-h-tap px-3 rounded-input bg-status-success text-white text-small"
            data-testid="field-job-slot-complete"
            @click="() => progressSlot(slot.id, 'complete')"
          >
            Done
          </button>
        </li>
      </ul>
    </section>

    <section v-if="checkIns.length > 0" class="mt-6">
      <h2 class="text-body font-semibold">Check-in history</h2>
      <ul class="mt-2 flex flex-col gap-2" data-testid="field-job-check-ins">
        <li
          v-for="row in checkIns"
          :key="row.id"
          class="bg-surface border border-border-muted rounded-input p-3 text-small"
        >
          <p class="font-semibold">
            {{ (row.metadata as { kind?: string }).kind === 'field.check_in' ? 'Checked in' : 'Checked out' }}
          </p>
          <p class="text-tiny text-text-secondary">
            {{ new Date(row.createdAt).toLocaleString() }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
