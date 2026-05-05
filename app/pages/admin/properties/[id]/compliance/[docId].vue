<!--
  app/pages/admin/properties/[id]/compliance/[docId].vue — preview (E7-S2 stub).

  # Decisions (ADR-0008)
    - This page exists today as a redirect target for the generator
      (E7-S2). It renders the doc summary in whatever state the row is
      in. The full polling-spinner-then-preview flow lands in E7-S3.
    - `{ server: false }` because the doc was just created in the
      client mock; SSR'ing this route would render an empty bundle.

  # Decision cast down
    - Rejected: blocking on the job here. The polling composable +
      preview iframe are S3 work; the S2 spec only needs to confirm
      that a redirect lands and the doc id renders.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))
const docId = computed(() => String(route.params.docId))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const complianceDoc = useService('complianceDoc')

useHead({ title: 'Compliance doc' })

const { data: doc } = await useAsyncData(
  () => `compliance-doc-${docId.value}-${orgId.value}`,
  () => complianceDoc.get(docId.value, orgId.value),
  { server: false, watch: [docId, orgId] },
)
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="compliance-doc-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Compliance', to: '' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">Compliance doc</h1>
      <p
        v-if="doc"
        class="text-body text-text-secondary mt-1"
        data-testid="compliance-doc-status"
        :data-status="doc.status"
      >
        Status: {{ doc.status }}
      </p>
    </header>

    <div v-if="!doc" class="mt-6">
      <EmptyState
        icon="·"
        title="Compliance doc not found"
        body="It may have been deleted. Head back to the property to start over."
        :cta="{
          label: 'Back to property',
          to: `/admin/properties/${propertyId}?tab=compliance`,
        }"
        data-testid="compliance-doc-not-found"
      />
    </div>

    <BulwarkCard v-else padding="md" class="mt-6">
      <dl class="grid grid-cols-2 gap-4 text-body">
        <div>
          <dt class="text-body-sm text-text-secondary">Doc ID</dt>
          <dd
            class="font-mono text-body-sm text-text-primary"
            data-testid="compliance-doc-id"
          >
            {{ doc.id }}
          </dd>
        </div>
        <div>
          <dt class="text-body-sm text-text-secondary">Signed by</dt>
          <dd class="text-text-primary">{{ doc.signature.signedByName }}</dd>
        </div>
        <div>
          <dt class="text-body-sm text-text-secondary">Slots included</dt>
          <dd
            class="text-text-primary"
            data-testid="compliance-doc-slot-count"
          >
            {{ doc.includedSlotIds.length }}
          </dd>
        </div>
        <div>
          <dt class="text-body-sm text-text-secondary">Job</dt>
          <dd class="font-mono text-body-sm text-text-secondary">
            {{ doc.jobId ?? '—' }}
          </dd>
        </div>
      </dl>

      <p class="mt-6 text-body-sm text-text-secondary">
        Live preview + download lands in E7-S3.
      </p>
    </BulwarkCard>
  </div>
</template>
