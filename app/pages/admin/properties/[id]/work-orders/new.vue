<!--
  app/pages/admin/properties/[id]/work-orders/new.vue — create WO from quote (E6-S2).

  # Decisions (ADR-0008)
    - Source-of-truth flow: load the quote via `?quoteId=…`, group its
      line items by the assessment field they came from, and pre-fill
      one trade slot per resolved trade. Items without a `sourceField`
      fall through to a single `general_labor` slot so nothing is lost.
    - Trade mapping is keyed on the compliance fields used by E5-S2's
      pre-populator: roofMaterial \u2192 roofing, sidingMaterial \u2192 siding,
      eaveType + ventType \u2192 eaves_vents, defensibleSpaceCleared \u2192
      defensible_space. We deliberately keep the mapping in this page
      rather than the contract: future stories may swap to a different
      taxonomy without touching schema.
    - Materials list is *not* pre-filled \u2014 quote line items don't
      carry a unit/qty in a form the WO needs, so we leave it empty
      and let the GC add rows post-create (lands fully in E6 follow-up).
    - On submit we call `workOrder.create(\u2026)` and `router.push(\u2026)` to
      the detail page so client-mutated mock state survives navigation.
    - We guard against creating a WO from a non-accepted quote by
      surfacing a banner and disabling the submit button.

  # Decision cast down
    - Rejected: a back-end "create from quote" RPC. Today the page is
      the only producer; a future SQL impl can wrap this client logic
      in a transaction without changing the contract.
    - Rejected: surfacing a quote picker. The CTA already lands here
      with a `quoteId` query; we shouldn't reopen that decision on the
      same screen.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type {
  WorkOrderCreateInput,
  TradeSlot,
  TradeSlotStatus,
} from '~~/shared/contracts/work-order'
import {
  TRADE_LABEL,
  type Trade,
} from '~~/shared/contracts/subcontractor'
import type { QuoteLineItem } from '~~/shared/contracts/quote'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New work order' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const quote = useService('quote')
const workOrder = useService('workOrder')
const { success: toastSuccess } = useToast()

const propertyId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const quoteIdQuery = computed(() => {
  const v = route.query.quoteId
  return typeof v === 'string' && v.length > 0 ? v : null
})

// Load property + quote in parallel.
const { data: bundle } = await useAsyncData(
  () => `wo-new-${propertyId.value}-${quoteIdQuery.value}-${orgId.value}`,
  async () => {
    const [p, q] = await Promise.all([
      property.get(propertyId.value, orgId.value),
      quoteIdQuery.value
        ? quote.get(quoteIdQuery.value, orgId.value)
        : Promise.resolve(null),
    ])
    return { property: p, quote: q }
  },
  { server: false, watch: [propertyId, quoteIdQuery, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const FIELD_TO_TRADE: Record<string, Trade> = {
  roofMaterial: 'roofing',
  sidingMaterial: 'siding',
  eaveType: 'eaves_vents',
  ventType: 'eaves_vents',
  defensibleSpaceCleared: 'defensible_space',
}

interface UiTradeSlot {
  trade: Trade
  description: string
}

function deriveSlotsFromLineItems(items: QuoteLineItem[]): UiTradeSlot[] {
  // Group items by trade so duplicate fields collapse.
  const byTrade = new Map<Trade, string[]>()
  for (const li of items) {
    const trade = li.sourceField ? FIELD_TO_TRADE[li.sourceField] : undefined
    const key: Trade = trade ?? 'general_labor'
    const arr = byTrade.get(key) ?? []
    arr.push(li.description)
    byTrade.set(key, arr)
  }
  // Stable trade order.
  const order: Trade[] = [
    'roofing',
    'siding',
    'gutters',
    'eaves_vents',
    'defensible_space',
    'general_labor',
  ]
  const slots = order
    .filter((t) => byTrade.has(t))
    .map<UiTradeSlot>((t) => ({
      trade: t,
      description: (byTrade.get(t) ?? []).join('; '),
    }))
  return slots.length > 0
    ? slots
    : [
        {
          trade: 'general_labor',
          description: 'General field work',
        },
      ]
}

const slots = ref<UiTradeSlot[]>([])
const populated = ref(false)

watch(
  () => bundle.value?.quote?.id,
  () => {
    if (!populated.value && bundle.value?.quote) {
      slots.value = deriveSlotsFromLineItems(bundle.value.quote.lineItems)
      populated.value = true
    }
  },
  { immediate: true },
)

const TRADE_OPTIONS: { value: Trade; label: string }[] = (
  Object.keys(TRADE_LABEL) as Trade[]
).map((t) => ({ value: t, label: TRADE_LABEL[t] }))

function addSlot() {
  slots.value = [
    ...slots.value,
    { trade: 'general_labor', description: '' },
  ]
}

function removeSlot(idx: number) {
  slots.value = slots.value.filter((_, i) => i !== idx)
}

const notes = ref('')
const submitting = ref(false)
const serverError = ref('')

const isAcceptedQuote = computed(
  () => bundle.value?.quote?.status === 'accepted',
)

const canSubmit = computed(
  () =>
    isAcceptedQuote.value &&
    slots.value.length > 0 &&
    slots.value.every((s) => s.description.trim().length > 0),
)

async function onSubmit() {
  if (!bundle.value?.quote || !bundle.value?.property) return
  if (!session.value?.userId) return
  serverError.value = ''
  submitting.value = true
  try {
    const tradeSlots: TradeSlot[] = slots.value.map((s) => ({
      // The mock service replaces these ids on create, but the contract
      // requires a UUID at this seam.
      id: crypto.randomUUID(),
      trade: s.trade,
      description: s.description.trim(),
      status: 'unassigned' satisfies TradeSlotStatus,
      assignedSubcontractorId: null,
      scheduledStart: null,
      scheduledEnd: null,
      notes: null,
    }))
    const input: WorkOrderCreateInput = {
      organizationId: orgId.value,
      propertyId: propertyId.value,
      quoteId: bundle.value.quote.id,
      scheduledStart: null,
      scheduledEnd: null,
      tradeSlots,
      materials: [],
      notes: notes.value.trim() || null,
      createdById: session.value.userId,
    }
    const created = await workOrder.create(input)
    toastSuccess('Work order created', created.workOrderNumber)
    await router.push(`/admin/work-orders/${created.id}`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not create work order.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="work-order-new">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'New work order' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">Create work order</h1>
      <p
        v-if="bundle?.quote"
        class="text-body text-text-secondary mt-1"
        data-testid="source-quote"
      >
        From quote {{ bundle.quote.quoteNumber }}
      </p>
    </header>

    <BulwarkCard
      v-if="bundle?.quote && !isAcceptedQuote"
      padding="md"
      class="mt-4 border border-status-warning/30 bg-status-warning/10"
      data-testid="quote-not-accepted-banner"
    >
      <p class="text-body text-text-primary">
        This quote is <strong>{{ bundle.quote.status }}</strong>. Only
        accepted quotes can become work orders.
      </p>
    </BulwarkCard>

    <BulwarkCard
      v-else-if="!bundle?.quote"
      padding="md"
      class="mt-4 border border-status-error/30 bg-status-error/10"
      data-testid="quote-missing-banner"
    >
      <p class="text-body text-text-primary">
        Source quote not found. Open this page from an accepted quote's
        Create-work-order CTA.
      </p>
    </BulwarkCard>

    <form class="mt-6 flex flex-col gap-4" @submit.prevent="onSubmit">
      <!-- Trade slots ------------------------------------------------ -->
      <section data-testid="trade-slots">
        <div class="flex items-end justify-between mb-2">
          <h2 class="text-h2">Trades</h2>
          <BulwarkButton
            type="button"
            variant="secondary"
            data-testid="add-trade-slot"
            @click="addSlot"
          >
            Add trade
          </BulwarkButton>
        </div>

        <ul class="flex flex-col gap-3">
          <li
            v-for="(slot, idx) in slots"
            :key="idx"
            data-testid="trade-slot"
            :data-trade="slot.trade"
          >
            <BulwarkCard padding="md">
              <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div class="md:col-span-4">
                  <BulwarkSelect
                    v-model="slots[idx]!.trade"
                    label="Trade"
                    :options="TRADE_OPTIONS"
                    :data-testid="`trade-slot-${idx}-trade`"
                  />
                </div>
                <div class="md:col-span-7">
                  <BulwarkInput
                    v-model="slots[idx]!.description"
                    label="Description"
                    :data-testid="`trade-slot-${idx}-description`"
                  />
                </div>
                <div class="md:col-span-1 flex md:justify-end items-end">
                  <BulwarkButton
                    type="button"
                    variant="secondary"
                    :data-testid="`trade-slot-${idx}-remove`"
                    :disabled="slots.length <= 1"
                    @click="removeSlot(idx)"
                  >
                    Remove
                  </BulwarkButton>
                </div>
              </div>
            </BulwarkCard>
          </li>
        </ul>
      </section>

      <!-- Notes ------------------------------------------------------ -->
      <section data-testid="notes-section">
        <h2 class="text-h2 mb-2">Notes</h2>
        <BulwarkTextarea
          v-model="notes"
          label="Internal notes"
          placeholder="Anything the field crew should know on day one"
          data-testid="wo-notes"
        />
      </section>

      <p
        v-if="serverError"
        class="text-small text-status-error"
        data-testid="server-error"
      >
        {{ serverError }}
      </p>

      <div class="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2">
        <NuxtLink
          v-if="bundle?.quote"
          :to="`/admin/properties/${propertyId}/quotes/${bundle.quote.id}`"
          class="text-body text-text-secondary hover:text-text-primary self-center"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="!canSubmit || submitting"
          data-testid="submit-button"
        >
          {{ submitting ? 'Creating…' : 'Create work order' }}
        </BulwarkButton>
      </div>
    </form>
  </div>
</template>
