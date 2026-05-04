<!--
  app/pages/admin/properties/[id]/quotes/new.vue — quote builder (E5-S1).

  # Decisions (ADR-0008)
    - Mobile-first single column; every input is full-width.
      The line-items table is a vertical card stack on narrow viewports
      (<md) and a real grid on wider screens. Drew quoted from his truck
      a few times during the demo — phone parity is not optional.
    - Money in the UI lives as integer cents in state; we render via
      `formatCents` and parse user input via `parseDollarsToCents`.
      Never store floats in state. Inputs use `inputmode="decimal"` so
      the on-screen keyboard does the right thing.
    - Totals are recomputed on every keystroke through the same
      `computeQuoteTotals` helper the service uses on persist. The
      preview can never disagree with what gets saved.
    - On `Save draft` we call `quote.create()` and `router.push` to the
      preview page (E5-S3). Client navigation only \u2014 mock service
      mutations don't survive a fresh SSR goto.
    - We do NOT pre-populate from the assessment yet (that's E5-S2). A
      single empty line item is added on mount so the form starts in a
      usable state.

  # Decision cast down
    - Rejected: a separate inline catalog picker. The materials/labor
      catalog is part of E9 (Settings); v1 ships free-text descriptions.
    - Rejected: real-time validation per keystroke. Errors only render
      after a submit attempt to keep the typing experience quiet.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  type QuoteCreateInput,
  type QuoteLineItem,
  type QuoteLineItemKind,
} from '~~/shared/contracts/quote'
import {
  computeQuoteTotals,
  formatCents,
  parseDollarsToCents,
} from '~~/shared/utils/money'
import { evaluateCompliance, OREGON_DEFAULT_STANDARDS } from '~~/shared/utils/compliance'
import type { ComplianceField, UpgradeItem } from '~~/shared/contracts/assessment'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New quote' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const assessment = useService('assessment')
const quote = useService('quote')

const propertyId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const { data: bundle } = await useAsyncData(
  () => `quote-builder-${propertyId.value}-${orgId.value}`,
  async () => {
    const [prop, latest] = await Promise.all([
      property.get(propertyId.value, orgId.value),
      assessment.getLatestForProperty(propertyId.value, orgId.value),
    ])
    return { property: prop, assessment: latest }
  },
  { watch: [propertyId, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const compliance = computed(() => {
  const a = bundle.value?.assessment
  if (!a) return null
  return evaluateCompliance(a, OREGON_DEFAULT_STANDARDS)
})

// E5-S2: when a non-compliant assessment exists, surface a button that
// pre-populates one labor line per required upgrade. We also auto-trigger
// when the page is opened with `?from=assessment` (the summary page's
// deep-link). The user can still tweak / remove items afterwards.
const FIELD_LABEL: Record<ComplianceField, string> = {
  roofMaterial: 'Roof material',
  sidingMaterial: 'Siding material',
  eaveType: 'Eave type',
  ventType: 'Vent type',
  defensibleSpaceCleared: 'Defensible space',
}

const upgradeSuggestions = computed<UpgradeItem[]>(() =>
  compliance.value && !compliance.value.overallCompliant
    ? compliance.value.requiredUpgrades
    : [],
)

// Local UI line-item shape. We keep `unitCostInput` as a string so the
// user can type freely; `unitCostCents` is derived for the totals math.
interface UiLineItem {
  id: string
  kind: QuoteLineItemKind
  description: string
  quantity: number
  unitCostInput: string
  sourceField: string
}

function blankItem(): UiLineItem {
  return {
    id: crypto.randomUUID(),
    kind: 'labor',
    description: '',
    quantity: 1,
    unitCostInput: '0',
    sourceField: '',
  }
}

const KIND_OPTIONS: { value: QuoteLineItemKind; label: string }[] = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'other', label: 'Other' },
]

const lineItems = ref<UiLineItem[]>([blankItem()])
const markupPercent = ref<number>(10)
const taxPercent = ref<number>(0)
const notes = ref('')

function populateFromAssessment() {
  const ups = upgradeSuggestions.value
  if (ups.length === 0) return
  lineItems.value = ups.map((u) => ({
    id: crypto.randomUUID(),
    kind: 'labor' as QuoteLineItemKind,
    description: `${FIELD_LABEL[u.field]}: upgrade to ${u.requiredValue}`,
    quantity: 1,
    unitCostInput: '0',
    sourceField: u.field,
  }))
  // Surface the assessmentId so the persisted quote links back to the
  // source data (audit trail; future re-evaluations will check freshness).
  linkedAssessmentId.value = bundle.value?.assessment?.id ?? null
}

const linkedAssessmentId = ref<string | null>(null)

// Auto-populate when arriving from the summary page's deep-link. We wait
// for `bundle` to resolve so the upgrades exist before we read them.
const populated = ref(false)
watch(
  () => bundle.value?.assessment?.id,
  () => {
    if (
      !populated.value &&
      route.query.from === 'assessment' &&
      upgradeSuggestions.value.length > 0
    ) {
      populateFromAssessment()
      populated.value = true
    }
  },
  { immediate: true },
)

const errors = ref<{
  lineItems?: string
  markupPercent?: string
  taxPercent?: string
}>({})
const serverError = ref('')
const submitting = ref(false)

function addItem() {
  lineItems.value.push(blankItem())
}

function removeItem(id: string) {
  if (lineItems.value.length === 1) {
    // Always keep at least one row; reset rather than remove.
    lineItems.value = [blankItem()]
    return
  }
  lineItems.value = lineItems.value.filter((li) => li.id !== id)
}

const contractItems = computed<QuoteLineItem[]>(() =>
  lineItems.value.map((li) => ({
    id: li.id,
    kind: li.kind,
    description: li.description.trim() || '(unnamed)',
    quantity: Number.isFinite(li.quantity) && li.quantity > 0 ? li.quantity : 0,
    unitCostCents: parseDollarsToCents(li.unitCostInput) ?? 0,
    sourceField: li.sourceField,
  })),
)

const totals = computed(() =>
  computeQuoteTotals(
    contractItems.value,
    Number.isFinite(markupPercent.value) ? markupPercent.value : 0,
    Number.isFinite(taxPercent.value) ? taxPercent.value : 0,
  ),
)

function validate(): boolean {
  errors.value = {}
  if (lineItems.value.length === 0) {
    errors.value.lineItems = 'Add at least one line item'
  } else {
    for (const li of lineItems.value) {
      if (!li.description.trim()) {
        errors.value.lineItems = 'Every line item needs a description'
        break
      }
      if (!(li.quantity > 0)) {
        errors.value.lineItems = 'Every line item needs a positive quantity'
        break
      }
      if (parseDollarsToCents(li.unitCostInput) === null) {
        errors.value.lineItems = 'Every line item needs a valid unit cost'
        break
      }
    }
  }
  if (markupPercent.value < 0 || markupPercent.value > 200) {
    errors.value.markupPercent = 'Markup must be between 0 and 200'
  }
  if (taxPercent.value < 0 || taxPercent.value > 50) {
    errors.value.taxPercent = 'Tax must be between 0 and 50'
  }
  return Object.keys(errors.value).length === 0
}

async function onSubmit() {
  serverError.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    const input: QuoteCreateInput = {
      organizationId: orgId.value,
      propertyId: propertyId.value,
      assessmentId: linkedAssessmentId.value,
      createdById: userId.value,
      lineItems: contractItems.value,
      markupPercent: markupPercent.value,
      taxPercent: taxPercent.value,
      expiresAt: null,
      notes: notes.value.trim() ? notes.value.trim() : null,
    }
    const created = await quote.create(input)
    await router.push(
      `/admin/properties/${propertyId.value}/quotes/${created.id}`,
    )
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not save quote.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="quote-builder">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'New quote' },
      ]"
    />
    <h1 class="text-display mt-2">New quote</h1>
    <p v-if="propertyAddress" class="text-body text-text-secondary mt-1" data-testid="quote-property-address">
      {{ propertyAddress }}
    </p>

    <!-- Pre-populate banner (E5-S2). Shown only when the latest assessment
         flagged at least one upgrade. Click replaces the line items. -->
    <BulwarkCard
      v-if="upgradeSuggestions.length > 0 && !populated"
      class="mt-4 border-status-info"
      padding="sm"
      data-testid="prepopulate-banner"
    >
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p class="text-body font-medium text-text-primary">
            Latest assessment flagged {{ upgradeSuggestions.length }} item(s).
          </p>
          <p class="text-small text-text-secondary">
            Pre-populate one labor line per required upgrade.
          </p>
        </div>
        <BulwarkButton
          type="button"
          variant="secondary"
          data-testid="prepopulate-button"
          @click="populateFromAssessment(); populated = true"
        >
          Start from assessment
        </BulwarkButton>
      </div>
    </BulwarkCard>

    <form class="mt-6 flex flex-col gap-6" novalidate @submit.prevent="onSubmit">
      <!-- Line items ------------------------------------------------ -->
      <section data-testid="line-items">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-h2">Line items</h2>
          <BulwarkButton
            type="button"
            variant="secondary"
            data-testid="add-line-item"
            @click="addItem"
          >
            + Add line item
          </BulwarkButton>
        </div>

        <div class="flex flex-col gap-3">
          <BulwarkCard
            v-for="(li, idx) in lineItems"
            :key="li.id"
            padding="sm"
            :data-testid="`line-item`"
            :data-line-index="idx"
          >
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <BulwarkSelect
                v-model="li.kind"
                label="Kind"
                :options="KIND_OPTIONS"
                class="md:col-span-2"
                :data-testid="`line-item-${idx}-kind`"
              />
              <BulwarkInput
                v-model="li.description"
                label="Description"
                placeholder="e.g. Replace asphalt roof with metal"
                class="md:col-span-5"
                :data-testid="`line-item-${idx}-description`"
              />
              <BulwarkInput
                v-model.number="li.quantity"
                label="Qty"
                type="number"
                inputmode="decimal"
                class="md:col-span-1"
                :data-testid="`line-item-${idx}-quantity`"
              />
              <BulwarkInput
                v-model="li.unitCostInput"
                label="Unit cost"
                placeholder="$0.00"
                inputmode="decimal"
                class="md:col-span-3"
                :data-testid="`line-item-${idx}-unit-cost`"
              />
              <div class="md:col-span-1 flex items-end h-full">
                <button
                  type="button"
                  class="text-text-secondary hover:text-status-error text-small mt-2 md:mt-6"
                  :data-testid="`line-item-${idx}-remove`"
                  :aria-label="`Remove line item ${idx + 1}`"
                  @click="removeItem(li.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </BulwarkCard>
        </div>

        <p
          v-if="errors.lineItems"
          class="mt-2 text-small text-status-error"
          data-testid="line-items-error"
        >
          {{ errors.lineItems }}
        </p>
      </section>

      <!-- Markup / tax ---------------------------------------------- -->
      <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulwarkInput
          v-model.number="markupPercent"
          label="Markup %"
          type="number"
          inputmode="decimal"
          :error="errors.markupPercent"
          data-testid="field-markupPercent"
        />
        <BulwarkInput
          v-model.number="taxPercent"
          label="Tax %"
          type="number"
          inputmode="decimal"
          :error="errors.taxPercent"
          data-testid="field-taxPercent"
        />
      </section>

      <!-- Notes ----------------------------------------------------- -->
      <BulwarkTextarea
        v-model="notes"
        label="Internal notes"
        placeholder="Anything the next person on this quote needs to know."
        :rows="3"
        data-testid="field-notes"
      />

      <!-- Totals ---------------------------------------------------- -->
      <BulwarkCard padding="md" data-testid="quote-totals">
        <dl class="flex flex-col gap-2 text-body">
          <div class="flex justify-between">
            <dt class="text-text-secondary">Subtotal</dt>
            <dd data-testid="totals-subtotal">{{ formatCents(totals.subtotalCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Markup</dt>
            <dd data-testid="totals-markup">{{ formatCents(totals.markupCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Tax</dt>
            <dd data-testid="totals-tax">{{ formatCents(totals.taxCents) }}</dd>
          </div>
          <div class="flex justify-between border-t border-border-default pt-2 font-medium">
            <dt>Total</dt>
            <dd data-testid="totals-total">{{ formatCents(totals.totalCents) }}</dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Actions --------------------------------------------------- -->
      <div class="flex flex-col-reverse md:flex-row md:justify-end gap-2">
        <NuxtLink
          :to="`/admin/properties/${propertyId}?tab=quotes`"
          class="text-body text-text-secondary hover:text-text-primary self-center"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="submitting"
          data-testid="submit-button"
        >
          {{ submitting ? 'Saving…' : 'Save draft' }}
        </BulwarkButton>
      </div>

      <p
        v-if="serverError"
        class="mt-2 text-small text-status-error"
        data-testid="server-error"
      >
        {{ serverError }}
      </p>
    </form>
  </div>
</template>
