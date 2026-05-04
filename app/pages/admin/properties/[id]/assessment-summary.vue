<!--
  app/pages/admin/properties/[id]/assessment-summary.vue — E4-S3.

  # Decisions (ADR-0008)
    - This page renders the *latest* assessment for the property,
      evaluated against `OREGON_DEFAULT_STANDARDS`. The evaluator is
      pure (E4-S1) so we just call it client-side; no extra service
      round-trip. When E9 lands per-tenant standards we'll swap the
      second arg for `useService('settings').getStandards(orgId)`.
    - Layout splits into two cards: an overall pass/fail banner up
      top (status-color band, plain-language summary) and a
      `requiredUpgrades` table beneath. The table renders one row per
      flagged field with current value, required value, and ORS/OAR
      reference \u2014 exactly the columns the PDF (E10) will need, so the
      shape is reusable.
    - Empty state for "no assessment yet" deep-links to the form. We
      don't auto-redirect because the caller might have arrived via a
      direct link / share, and a silent redirect breaks the URL contract.

  # Decision cast down
    - Rejected: showing partial results when only some materials have
      been entered. The contract says assessment is all-or-nothing
      (the form requires every material), so a partial assessment
      should be impossible to construct. We treat null = "not started."
    - Rejected: editable inline. Re-doing an assessment goes back through
      the form (so the audit trail captures who/when). The summary is
      read-only on purpose.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { evaluateCompliance, OREGON_DEFAULT_STANDARDS } from '~~/shared/utils/compliance'
import type { ComplianceField } from '~~/shared/contracts/assessment'

definePageMeta({
  middleware: ['role'],
  requiredRoles: [...ROLE_GROUPS.admin, 'field'],
})

useHead({ title: 'Assessment summary' })

const route = useRoute()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const assessment = useService('assessment')

const propertyId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle } = await useAsyncData(
  () => `assessment-summary-${propertyId.value}-${orgId.value}`,
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

const result = computed(() => {
  const a = bundle.value?.assessment
  if (!a) return null
  return evaluateCompliance(a, OREGON_DEFAULT_STANDARDS)
})

// Field labels for the upgrades table. Mirrors the form's option labels so
// the user sees the same words on both screens.
const FIELD_LABEL: Record<ComplianceField, string> = {
  roofMaterial: 'Roof material',
  sidingMaterial: 'Siding material',
  eaveType: 'Eave type',
  ventType: 'Vent type',
  defensibleSpaceCleared: 'Defensible space',
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="assessment-summary">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Assessment summary' },
      ]"
    />
    <h1 class="text-display mt-2">Assessment summary</h1>
    <p v-if="propertyAddress" class="text-body text-text-secondary mt-1">
      {{ propertyAddress }}
    </p>

    <!-- No assessment yet -->
    <div v-if="!bundle?.assessment" data-testid="summary-empty" class="mt-8">
      <EmptyState
        icon="·"
        title="No assessment yet"
        body="Run the field assessment to evaluate this property against Oregon WUI standards."
      />
      <div class="flex justify-center -mt-6">
        <NuxtLink
          :to="`/admin/properties/${propertyId}/assessment`"
          class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
          data-testid="start-assessment-cta"
        >
          Start assessment
        </NuxtLink>
      </div>
    </div>

    <template v-else-if="result">
      <!-- Overall banner -->
      <BulwarkCard
        class="mt-6"
        :class="result.overallCompliant ? 'border-status-success' : 'border-status-error'"
        data-testid="summary-banner"
        :data-compliant="result.overallCompliant ? 'true' : 'false'"
      >
        <div class="flex items-start gap-4">
          <div
            class="text-2xl"
            :class="result.overallCompliant ? 'text-status-success' : 'text-status-error'"
          >
            {{ result.overallCompliant ? '✓' : '!' }}
          </div>
          <div>
            <h2 class="text-heading">
              {{ result.overallCompliant ? 'Compliant' : 'Non-compliant' }}
            </h2>
            <p class="text-body text-text-secondary mt-1">
              <template v-if="result.overallCompliant">
                Every measured field meets the Oregon WUI baseline standards.
              </template>
              <template v-else>
                {{ result.requiredUpgrades.length }} item(s) require upgrade to meet
                Oregon WUI baseline standards.
              </template>
            </p>
          </div>
        </div>
      </BulwarkCard>

      <!-- Upgrades table -->
      <BulwarkCard
        v-if="!result.overallCompliant"
        class="mt-4"
        data-testid="summary-upgrades"
      >
        <h3 class="text-heading mb-3">Required upgrades</h3>
        <ul class="flex flex-col divide-y divide-border-default">
          <li
            v-for="item in result.requiredUpgrades"
            :key="item.field"
            class="py-3 flex flex-col gap-1"
            :data-testid="`upgrade-${item.field}`"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="text-body font-medium text-text-primary">
                {{ FIELD_LABEL[item.field] }}
              </span>
              <span class="text-small text-text-secondary">{{ item.standardRef }}</span>
            </div>
            <p class="text-small text-text-secondary">
              <span class="font-medium text-text-primary">Current:</span>
              {{ item.currentValue }}
            </p>
            <p class="text-small text-text-secondary">
              <span class="font-medium text-text-primary">Required:</span>
              {{ item.requiredValue }}
            </p>
          </li>
        </ul>
      </BulwarkCard>

      <div class="mt-4 flex items-center gap-3 flex-wrap">
        <NuxtLink
          v-if="!result.overallCompliant"
          :to="`/admin/properties/${propertyId}/quotes/new?from=assessment`"
          class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
          data-testid="build-quote-from-assessment"
        >
          Build quote from upgrades
        </NuxtLink>
        <NuxtLink
          :to="`/admin/properties/${propertyId}/assessment`"
          class="text-body text-primary hover:underline"
          data-testid="redo-assessment-link"
        >
          Re-run assessment
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
