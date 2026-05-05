<!--
  app/pages/admin/properties/[id]/invoices/new.vue — create invoice from WO (E8-S3).

  # Decisions (ADR-0008)
    - Source-of-truth flow: load the work order via `?workOrderId=…`,
      pre-fill one labor line per trade slot (description carried
      across, unit cost editable) and one material line per WO
      material (quantity + unit cost copied from the row, kind =
      `material`). The GC tweaks the labor numbers in place and
      submits.
    - Mirrors the WO-from-quote create flow's shape: editable list +
      add-row + delete-row + notes + a single primary submit. We do
      not split labor / material into sub-lists; the contract uses
      one `lineItems` array with a `kind` discriminator.
    - Default `dueAt` is 30 days from now (industry convention).
      Markup default is 0% (the labor rates already include profit
      for v1). Tax default is 0% (tax-exempt jurisdictions are the
      common case for the demo customer).
    - We do NOT gate the CTA on WO status === completed. Drew's demo
      walkthrough wants to surface this affordance regardless; once a
      real customer asks, we can introduce gating without changing
      the contract.
    - Submit calls `invoice.create()` then `router.push()` to the
      detail page so the client-mutated mock state survives the
      navigation (mock-state-nav rule, learned in E4-S3).

  # Decision cast down
    - Rejected: an automatic "labor cost from quote" derivation. The
      WO has already been priced; the invoice may diverge (overtime,
      change orders) and the GC needs the freedom to type real
      numbers. Pre-fill description + zero cents is the best balance.
    - Rejected: line-item reordering. Sponsor never asked for it and
      the demo invoice is short.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { computeQuoteTotals, parseDollarsToCents, formatCents } from '~~/shared/utils/money'
import type { InvoiceLineItem } from '~~/shared/contracts/invoice'
import { TRADE_LABEL } from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New invoice' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const workOrder = useService('workOrder')
const invoice = useService('invoice')
const { success: toastSuccess } = useToast()

const propertyId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const workOrderIdQuery = computed(() => {
  const v = route.query.workOrderId
  return typeof v === 'string' && v.length > 0 ? v : null
})

const { data: bundle } = await useAsyncData(
  () => `invoice-new-${propertyId.value}-${workOrderIdQuery.value}-${orgId.value}`,
  async () => {
    const [p, wo] = await Promise.all([
      property.get(propertyId.value, orgId.value),
      workOrderIdQuery.value
        ? workOrder.get(workOrderIdQuery.value, orgId.value)
        : Promise.resolve(null),
    ])
    return { property: p, workOrder: wo }
  },
  { server: false, watch: [propertyId, workOrderIdQuery, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

interface UiLine {
  uid: string
  kind: InvoiceLineItem['kind']
  description: string
  quantity: number
  unitCostDollars: string // form-bound; converts to cents on submit
}

let _lineUid = 0
function makeUid(): string {
  _lineUid += 1
  return `line-${_lineUid}`
}

const lines = ref<UiLine[]>([])
const markupPercent = ref(0)
const taxPercent = ref(0)
const notes = ref('')
const dueDate = ref('') // yyyy-mm-dd

// Pre-fill once when the WO bundle resolves.
watchEffect(() => {
  if (lines.value.length > 0) return
  const wo = bundle.value?.workOrder
  if (!wo) return
  const seed: UiLine[] = []
  for (const slot of wo.tradeSlots) {
    seed.push({
      uid: makeUid(),
      kind: 'labor',
      description: `${TRADE_LABEL[slot.trade]} — ${slot.description}`,
      quantity: 1,
      unitCostDollars: '',
    })
  }
  for (const m of wo.materials) {
    seed.push({
      uid: makeUid(),
      kind: 'material',
      description: m.name,
      quantity: m.quantity,
      unitCostDollars: (m.unitCostCents / 100).toFixed(2),
    })
  }
  lines.value = seed

  // Default due date: 30 days from now.
  const due = new Date()
  due.setDate(due.getDate() + 30)
  dueDate.value = due.toISOString().slice(0, 10)
})

function addLine() {
  lines.value.push({
    uid: makeUid(),
    kind: 'labor',
    description: '',
    quantity: 1,
    unitCostDollars: '',
  })
}

function removeLine(uid: string) {
  lines.value = lines.value.filter((l) => l.uid !== uid)
}

const liveTotals = computed(() => {
  const mapped = lines.value.map((l) => ({
    sourceField: '',
    description: l.description,
    quantity: l.quantity || 0,
    unitCostCents: parseDollarsToCents(l.unitCostDollars) ?? 0,
  }))
  return computeQuoteTotals(mapped, markupPercent.value, taxPercent.value)
})

const submitting = ref(false)
const serverError = ref('')

async function onSubmit() {
  if (!bundle.value?.workOrder) return
  serverError.value = ''
  submitting.value = true
  try {
    const created = await invoice.create({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      workOrderId: bundle.value.workOrder.id,
      quoteId: bundle.value.workOrder.quoteId ?? null,
      dueAt: dueDate.value
        ? new Date(`${dueDate.value}T17:00:00.000Z`).toISOString()
        : null,
      lineItems: lines.value.map((l) => ({
        id: l.uid,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity || 0,
        unitCostCents: parseDollarsToCents(l.unitCostDollars) ?? 0,
      })),
      markupPercent: markupPercent.value,
      taxPercent: taxPercent.value,
      notes: notes.value.trim() || null,
    })
    toastSuccess('Invoice created', `${created.invoiceNumber} is ready to send.`)
    await router.push(`/admin/invoices/${created.id}`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not create invoice.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="invoice-new">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'New invoice' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">New invoice</h1>
      <p
        v-if="bundle?.workOrder"
        class="text-body text-text-secondary mt-1"
        data-testid="invoice-new-wo-ref"
      >
        From {{ bundle.workOrder.workOrderNumber }}
      </p>
    </header>

    <div v-if="!bundle?.workOrder" class="mt-6">
      <EmptyState
        icon="·"
        title="Work order not found"
        body="Open the invoice flow from a work order detail page."
        :cta="{ label: 'Browse work orders', to: '/admin/work-orders' }"
        data-testid="invoice-new-no-wo"
      />
    </div>

    <form v-else class="mt-6" data-testid="invoice-new-form" @submit.prevent="onSubmit">
      <!-- Line items ------------------------------------------------ -->
      <section data-testid="invoice-new-lines">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-h2">Line items</h2>
          <BulwarkButton
            type="button"
            variant="secondary"
            size="sm"
            data-testid="invoice-new-add-line"
            @click="addLine"
          >
            Add line
          </BulwarkButton>
        </div>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="line in lines"
              :key="line.uid"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="invoice-new-line"
            >
              <div class="md:col-span-6">
                <BulwarkInput
                  v-model="line.description"
                  label="Description"
                  required
                />
              </div>
              <div class="md:col-span-2">
                <BulwarkInput
                  v-model.number="line.quantity"
                  type="number"
                  label="Qty"
                  min="0"
                  step="1"
                />
              </div>
              <div class="md:col-span-3">
                <BulwarkInput
                  v-model="line.unitCostDollars"
                  label="Unit ($)"
                  inputmode="decimal"
                  placeholder="0.00"
                />
              </div>
              <div class="md:col-span-1 flex items-end">
                <button
                  type="button"
                  class="text-small text-status-error hover:underline"
                  data-testid="invoice-new-remove-line"
                  @click="removeLine(line.uid)"
                >
                  Remove
                </button>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Settings -------------------------------------------------- -->
      <section class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <BulwarkInput
          v-model.number="markupPercent"
          type="number"
          label="Markup %"
          min="0"
          max="200"
          step="1"
        />
        <BulwarkInput
          v-model.number="taxPercent"
          type="number"
          label="Tax %"
          min="0"
          max="50"
          step="0.1"
        />
        <BulwarkInput
          v-model="dueDate"
          type="date"
          label="Due date"
        />
      </section>

      <!-- Live totals ---------------------------------------------- -->
      <BulwarkCard padding="md" class="mt-4" data-testid="invoice-new-totals">
        <dl class="flex flex-col gap-2 text-body">
          <div class="flex justify-between">
            <dt class="text-text-secondary">Subtotal</dt>
            <dd>{{ formatCents(liveTotals.subtotalCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Markup</dt>
            <dd>{{ formatCents(liveTotals.markupCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Tax</dt>
            <dd>{{ formatCents(liveTotals.taxCents) }}</dd>
          </div>
          <div class="flex justify-between border-t border-border-default pt-2 font-medium">
            <dt>Total</dt>
            <dd data-testid="invoice-new-total">{{ formatCents(liveTotals.totalCents) }}</dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Notes ----------------------------------------------------- -->
      <section class="mt-4">
        <label class="block text-small font-medium text-text-secondary mb-1">
          Internal notes
        </label>
        <textarea
          v-model="notes"
          class="w-full rounded-card border border-border-default p-2 text-body min-h-[6rem]"
          data-testid="invoice-new-notes"
        />
      </section>

      <!-- Actions --------------------------------------------------- -->
      <div class="mt-6 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2">
        <NuxtLink
          :to="`/admin/work-orders/${bundle.workOrder.id}`"
          class="text-body text-text-secondary hover:text-text-primary self-center"
        >
          Cancel
        </NuxtLink>
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="submitting || lines.length === 0"
          data-testid="invoice-new-submit"
        >
          {{ submitting ? 'Saving…' : 'Create invoice' }}
        </BulwarkButton>
      </div>

      <p
        v-if="serverError"
        class="mt-3 text-small text-status-error"
        data-testid="invoice-new-error"
      >
        {{ serverError }}
      </p>
    </form>
  </div>
</template>
