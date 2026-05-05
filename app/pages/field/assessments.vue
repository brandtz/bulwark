<!--
  app/pages/field/assessments.vue — recent assessments list (E10).

  # Decisions (ADR-0008)
    - Read-only mobile list of every assessment in the active org,
      newest first. Each row is a tap-target back to the
      assessment-summary page (already field-allowed).

  # Decision cast down
    - Rejected: filtering to "my assessments". The mock assessment
      row has no field-user link; in production this becomes
      `assessment.list({ assessedBy: session.userId })`.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

useHead({ title: 'Assessments' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const assessment = useService('assessment')
const property = useService('property')

interface Row {
  id: string
  propertyId: string
  address: string
  assessedAt: string
}

const { data: rows } = await useAsyncData(
  () => `field-assessments-${orgId.value}`,
  async () => {
    const out = await assessment.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    const props = await property.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
    })
    const propMap = new Map(props.rows.map((p) => [p.id, p]))
    return [...out.rows]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map<Row>((a) => ({
        id: a.id,
        propertyId: a.propertyId,
        address: propMap.get(a.propertyId)?.addressLine1 ?? a.propertyId,
        assessedAt: a.createdAt,
      }))
  },
  { server: false, watch: [orgId] },
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-assessments">
    <header>
      <h1 class="text-display">Assessments</h1>
      <p class="text-body text-text-secondary mt-1">
        Most recent first.
      </p>
    </header>

    <BulwarkCard
      v-if="!rows || rows.length === 0"
      padding="md"
      class="mt-4"
    >
      <p class="text-body text-text-secondary" data-testid="field-assessments-empty">
        No assessments captured yet.
      </p>
    </BulwarkCard>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li v-for="r in rows" :key="r.id" data-testid="field-assessment-row">
        <NuxtLink
          :to="`/admin/properties/${r.propertyId}/assessment-summary`"
          class="block"
        >
          <BulwarkCard padding="md" clickable>
            <p class="text-body font-medium truncate">{{ r.address }}</p>
            <p class="text-small text-text-secondary mt-1">
              Captured {{ formatDate(r.assessedAt) }}
            </p>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
