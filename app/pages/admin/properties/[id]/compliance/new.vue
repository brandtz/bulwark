<!--
  app/pages/admin/properties/[id]/compliance/new.vue — generator (E7-S2).

  # Decisions (ADR-0008)
    - The generator is a single-page form: pick which trade slots
      (across all the property's work orders) belong on the doc, capture
      the GC's signature + name, hit Generate. Submit creates the
      ComplianceDoc row (status=generating, jobId set), then redirects
      to the doc detail page where the polling/preview lives (E7-S3).
    - Trade slots are the grain — not work orders — because a single WO
      often has a mix of completed-vs-blocked trades, and the homeowner
      cares about WHAT was done, not which envelope it shipped under.
      Each completed slot is pre-checked; non-completed slots are still
      offered so a GC can ship a "partial" certificate (e.g. roof done,
      windows pending under a future WO).
    - `{ server: false }` on the asyncData. WOs created during this
      session live in the client-side mock instance only; SSR'ing this
      page would render a stale empty list (carried lesson from E5/E6).

  # Decision cast down
    - Rejected: a single "include everything completed" toggle. The
      sponsor explicitly wants to scope down before generating (some
      trades pass under a different inspector and ship separately).
    - Rejected: gating submit behind a min-1-completed-slot rule. A
      partial-progress doc is a real workflow; we only require >=1
      slot selected and a non-empty signature.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { TRADE_LABEL } from '~~/shared/contracts/subcontractor'
import type { TradeSlotStatus } from '~~/shared/contracts/work-order'

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

const property = useService('property')
const workOrder = useService('workOrder')
const complianceDoc = useService('complianceDoc')
const toast = useToast()

useHead({ title: 'Generate compliance doc' })

const SLOT_STATUS_LABEL: Record<TradeSlotStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

const SLOT_STATUS_TONE: Record<TradeSlotStatus, string> = {
  unassigned: 'bg-surface-muted text-text-secondary',
  assigned: 'bg-status-info/10 text-status-info',
  in_progress: 'bg-status-warning/10 text-status-warning',
  completed: 'bg-status-success/10 text-status-success',
  blocked: 'bg-status-error/10 text-status-error',
}

// Reactive form state.
const selectedSlotIds = ref<Set<string>>(new Set())
const signerName = ref('')
const signatureDataUrl = ref('')
const signatureEmpty = ref(true)
const submitting = ref(false)
const submitError = ref('')

const { data: bundle } = await useAsyncData(
  () => `compliance-new-${propertyId.value}-${orgId.value}`,
  async () => {
    const p = await property.get(propertyId.value, orgId.value)
    if (!p) return { property: null, workOrders: [] }
    const list = await workOrder.list({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      page: 1,
      pageSize: 100,
    })
    return { property: p, workOrders: list.rows }
  },
  { server: false, watch: [propertyId, orgId] },
)

// Pre-check completed slots once we have data.
watch(
  () => bundle.value?.workOrders,
  (rows) => {
    if (!rows) return
    if (selectedSlotIds.value.size > 0) return
    const next = new Set<string>()
    for (const wo of rows) {
      for (const slot of wo.tradeSlots) {
        if (slot.status === 'completed') next.add(slot.id)
      }
    }
    selectedSlotIds.value = next
  },
  { immediate: true },
)

function toggleSlot(slotId: string) {
  const next = new Set(selectedSlotIds.value)
  if (next.has(slotId)) next.delete(slotId)
  else next.add(slotId)
  selectedSlotIds.value = next
}

const allSlots = computed(() =>
  (bundle.value?.workOrders ?? []).flatMap((wo) =>
    wo.tradeSlots.map((s) => ({ wo, slot: s })),
  ),
)

const selectedCount = computed(() => selectedSlotIds.value.size)

const canSubmit = computed(() => {
  return (
    !submitting.value &&
    selectedCount.value > 0 &&
    signerName.value.trim().length > 0 &&
    !signatureEmpty.value &&
    signatureDataUrl.value.length > 0
  )
})

async function onSubmit() {
  submitError.value = ''
  if (!canSubmit.value) {
    if (selectedCount.value === 0) {
      submitError.value = 'Select at least one trade slot to include.'
    } else if (signerName.value.trim().length === 0) {
      submitError.value = 'Enter the signer\u2019s name.'
    } else if (signatureEmpty.value) {
      submitError.value = 'Capture a signature before generating.'
    }
    return
  }
  submitting.value = true
  try {
    // Collect the WO ids the selected slots belong to.
    const woIds = new Set<string>()
    for (const { wo, slot } of allSlots.value) {
      if (selectedSlotIds.value.has(slot.id)) woIds.add(wo.id)
    }
    const doc = await complianceDoc.create({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      workOrderIds: Array.from(woIds),
      includedSlotIds: Array.from(selectedSlotIds.value),
      signature: {
        signedByName: signerName.value.trim(),
        dataUrl: signatureDataUrl.value,
      },
    })
    toast.success('Compliance doc queued', 'Generation started.')
    await router.push(
      `/admin/properties/${propertyId.value}/compliance/${doc.id}`,
    )
  } catch (err) {
    submitError.value =
      err instanceof Error ? err.message : 'Failed to create compliance doc.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="p-4 md:p-6 max-w-4xl mx-auto"
    data-testid="compliance-generator"
  >
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        bundle?.property
          ? {
              label: bundle.property.addressLine1,
              to: `/admin/properties/${propertyId}`,
            }
          : { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Compliance', to: '' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">Generate compliance doc</h1>
      <p class="text-body text-text-secondary mt-1">
        Pick the trade slots to include, then capture the GC signature.
      </p>
    </header>

    <div v-if="!bundle?.property" class="mt-6">
      <EmptyState
        icon="·"
        title="Property not found"
        body="It may have been deleted. Head back to the pipeline to pick another."
        data-testid="compliance-property-not-found"
      />
    </div>

    <form
      v-else
      class="mt-6 flex flex-col gap-6"
      data-testid="compliance-generator-form"
      @submit.prevent="onSubmit"
    >
      <!-- Trade-slot checklist. -->
      <BulwarkCard padding="md">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-heading">Included scope</h2>
          <span
            class="text-body-sm text-text-secondary"
            data-testid="compliance-selected-count"
          >
            {{ selectedCount }} selected
          </span>
        </div>

        <div
          v-if="allSlots.length === 0"
          class="mt-4"
        >
          <EmptyState
            icon="·"
            title="No work orders for this property"
            body="Create at least one work order before generating a compliance doc."
            :cta="{
              label: 'New work order',
              to: `/admin/properties/${propertyId}/work-orders/new`,
            }"
            data-testid="compliance-no-work-orders"
          />
        </div>

        <ul v-else class="mt-4 flex flex-col gap-3">
          <li
            v-for="entry in allSlots"
            :key="entry.slot.id"
            class="flex items-start gap-3 rounded-input border border-border-subtle bg-surface-base p-3"
            :data-testid="`compliance-slot-${entry.slot.id}`"
          >
            <input
              :id="`slot-${entry.slot.id}`"
              type="checkbox"
              class="mt-1 h-5 w-5 rounded border-border-strong text-primary focus:ring-primary"
              :checked="selectedSlotIds.has(entry.slot.id)"
              :data-testid="`compliance-slot-toggle-${entry.slot.id}`"
              @change="toggleSlot(entry.slot.id)"
            >
            <label
              :for="`slot-${entry.slot.id}`"
              class="flex flex-1 flex-col gap-1 cursor-pointer"
            >
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-body font-medium text-text-primary">
                  {{ TRADE_LABEL[entry.slot.trade] }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-body-sm"
                  :class="SLOT_STATUS_TONE[entry.slot.status]"
                >
                  {{ SLOT_STATUS_LABEL[entry.slot.status] }}
                </span>
                <span class="text-body-sm text-text-secondary">
                  · WO {{ entry.wo.workOrderNumber }}
                </span>
              </span>
              <span class="text-body-sm text-text-secondary">
                {{ entry.slot.description }}
              </span>
            </label>
          </li>
        </ul>
      </BulwarkCard>

      <!-- Signature capture. -->
      <BulwarkCard padding="md">
        <h2 class="text-heading">GC signature</h2>
        <p class="text-body text-text-secondary mt-1">
          The signing GC certifies the included scope is complete and
          compliant.
        </p>

        <div class="mt-4 flex flex-col gap-4">
          <BulwarkInput
            v-model="signerName"
            label="Signer name"
            placeholder="e.g. Drew McKenzie"
            required
            data-testid="compliance-signer-name"
          />
          <SignaturePad
            v-model="signatureDataUrl"
            v-model:is-empty="signatureEmpty"
          />
        </div>
      </BulwarkCard>

      <p
        v-if="submitError"
        class="text-body-sm text-status-error"
        data-testid="compliance-submit-error"
      >
        {{ submitError }}
      </p>

      <div class="flex items-center gap-3">
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="!canSubmit"
          data-testid="compliance-generate-button"
        >
          {{ submitting ? 'Generating\u2026' : 'Generate' }}
        </BulwarkButton>
        <NuxtLink
          :to="`/admin/properties/${propertyId}?tab=compliance`"
          class="text-body text-text-secondary hover:text-text-primary"
          data-testid="compliance-cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
