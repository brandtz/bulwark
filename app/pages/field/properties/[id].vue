<!--
  app/pages/field/properties/[id].vue — single property, field view (E10-S5).

  # Decisions (ADR-0008)
    - Mobile-first read-only summary: address + status + latest
      assessment compliance result + a CTA into the (already
      field-allowed) `/admin/properties/[id]/assessment` form.
    - Deliberately omits Quotes / Invoices / Compliance docs —
      those are admin surfaces. The field-side property detail
      is a launchpad to the assessment.

  # Decision cast down
    - Rejected: reusing `/admin/properties/[id]` with conditional
      tabs. The persona-matrix spec FORBIDS field on /admin/*
      and that's the right call: separate routes keep RBAC
      legible and let the field surface stay 390px-tight.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { evaluateCompliance, OREGON_DEFAULT_STANDARDS } from '~~/shared/utils/compliance'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const property = useService('property')
const assessment = useService('assessment')

const { data: bundle } = await useAsyncData(
  () => `field-property-${propertyId.value}-${orgId.value}`,
  async () => {
    const p = await property.get(propertyId.value, orgId.value)
    if (!p) return { property: null, assessment: null }
    const a = await assessment.getLatestForProperty(p.id, orgId.value)
    return { property: p, assessment: a }
  },
  { server: false, watch: [propertyId, orgId] },
)

useHead(() => ({
  title: bundle.value?.property
    ? `${bundle.value.property.addressLine1} — Bulwark`
    : 'Property — Bulwark',
}))

const compliance = computed(() => {
  const a = bundle.value?.assessment
  if (!a) return null
  return evaluateCompliance(a, OREGON_DEFAULT_STANDARDS)
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-property-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/field/properties' },
        { label: bundle?.property?.addressLine1 ?? 'Not found' },
      ]"
    />

    <template v-if="!bundle?.property">
      <EmptyState
        icon="·"
        title="Property not found"
        body="It may have been deleted, or you don't have access."
        :cta="{ label: 'Back to properties', to: '/field/properties' }"
      />
    </template>

    <template v-else>
      <header class="mt-2">
        <h1 class="text-display" data-testid="field-property-address">
          {{ bundle.property.addressLine1 }}
        </h1>
        <p class="text-body text-text-secondary mt-1">
          {{ bundle.property.city }}, {{ bundle.property.state }} {{ bundle.property.postalCode }}
        </p>
        <div class="mt-3">
          <StatusBadge :status="bundle.property.status" />
        </div>
      </header>

      <BulwarkCard padding="md" class="mt-4" data-testid="field-property-assessment-summary">
        <p class="text-tiny uppercase text-text-secondary">Latest assessment</p>
        <template v-if="!bundle.assessment">
          <p class="text-body mt-2">No assessment yet.</p>
        </template>
        <template v-else>
          <p class="text-body mt-2">
            <span v-if="compliance?.overallCompliant" class="text-status-success font-medium">
              Compliant
            </span>
            <span v-else class="text-status-error font-medium">
              Non-compliant ({{ compliance?.nonCompliantFields.length ?? 0 }} issue(s))
            </span>
          </p>
        </template>
      </BulwarkCard>

      <div class="mt-4 flex flex-col gap-2">
        <NuxtLink
          :to="`/admin/properties/${bundle.property.id}/assessment`"
          class="block"
          data-testid="field-start-assessment"
        >
          <BulwarkCard padding="md" clickable>
            <p class="text-body font-medium">
              {{ bundle.assessment ? 'Update assessment' : 'Start assessment' }}
            </p>
            <p class="text-small text-text-secondary mt-1">
              Capture site conditions on the assessment form.
            </p>
          </BulwarkCard>
        </NuxtLink>
        <NuxtLink
          v-if="bundle.assessment"
          :to="`/admin/properties/${bundle.property.id}/assessment-summary`"
          class="block"
          data-testid="field-view-summary"
        >
          <BulwarkCard padding="md" clickable>
            <p class="text-body font-medium">View assessment summary</p>
            <p class="text-small text-text-secondary mt-1">
              See compliance findings and recommendations.
            </p>
          </BulwarkCard>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
