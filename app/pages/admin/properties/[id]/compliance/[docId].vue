<!--
  app/pages/admin/properties/[id]/compliance/[docId].vue — preview (E7-S3).

  # Decisions (ADR-0008)
    - Three states surfaced explicitly: `generating` (spinner +
      reassuring copy), `ready` (preview iframe + download CTA), and
      `failed` (inline error + retry CTA back to the generator).
    - Polling is delegated to `useComplianceDocPolling` so the page
      stays declarative. The composable kicks off on mount when the
      doc is non-terminal and tears down on unmount.
    - `{ server: false }` because the doc was just minted in the
      client-side mock; SSR would render an empty bundle.
    - The preview iframe uses `sandbox` defensively so the eventual
      remote PDF can't navigate the parent. `referrerpolicy=no-referrer`
      keeps the signed URL out of any third-party logs.

  # Decision cast down
    - Rejected: SSE / websocket subscription. Out of scope until E11
      ships the real worker. setInterval polling at 400ms feels live
      enough for the always-async demo target (TECH §9).
    - Rejected: surfacing the underlying job id in the UI. It's a
      backend implementation detail; the user only cares about doc
      state.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { isTerminalComplianceDocStatus } from '~~/shared/contracts/compliance'

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

const { polling, error, start } = useComplianceDocPolling(doc, orgId)

onMounted(() => {
  if (doc.value && !isTerminalComplianceDocStatus(doc.value.status)) {
    start()
  }
})

watch(doc, (next) => {
  if (next && !isTerminalComplianceDocStatus(next.status) && !polling.value) {
    start()
  }
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="compliance-doc-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Compliance', to: '' },
      ]"
    />

    <header class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-display">Compliance doc</h1>
        <p
          v-if="doc"
          class="text-body text-text-secondary mt-1"
          data-testid="compliance-doc-status"
          :data-status="doc.status"
        >
          Status: {{ doc.status }}
        </p>
      </div>
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

    <template v-else>
      <BulwarkCard padding="md" class="mt-6">
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
            <dt class="text-body-sm text-text-secondary">Signed at</dt>
            <dd class="text-text-primary">
              {{ new Date(doc.signature.signedAt).toLocaleString() }}
            </dd>
          </div>
        </dl>
      </BulwarkCard>

      <BulwarkCard
        v-if="doc.status === 'generating'"
        padding="lg"
        class="mt-6"
      >
        <div
          class="flex flex-col items-center gap-3 py-6"
          data-testid="compliance-generating"
        >
          <span
            class="inline-block h-10 w-10 rounded-full border-4 border-border-subtle border-t-primary animate-spin"
            aria-hidden="true"
          />
          <p class="text-heading">Generating compliance PDF&hellip;</p>
          <p class="text-body text-text-secondary">
            This usually takes a couple of seconds. Sit tight.
          </p>
        </div>
      </BulwarkCard>

      <BulwarkCard
        v-else-if="doc.status === 'ready' && doc.resultUrl"
        padding="md"
        class="mt-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-heading">Preview</h2>
            <p class="text-body text-text-secondary">
              Compliance PDF is ready to share.
            </p>
          </div>
          <a
            :href="doc.resultUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-hover transition"
            data-testid="compliance-download-button"
          >
            Download PDF
          </a>
        </div>
        <iframe
          :src="doc.resultUrl"
          class="mt-4 h-[480px] w-full rounded border border-border-subtle bg-surface-base"
          sandbox=""
          referrerpolicy="no-referrer"
          title="Compliance PDF preview"
          data-testid="compliance-preview-iframe"
        />
      </BulwarkCard>

      <BulwarkCard
        v-else-if="doc.status === 'failed'"
        padding="md"
        class="mt-6"
      >
        <div data-testid="compliance-failed" class="flex flex-col gap-3">
          <h2 class="text-heading text-status-error">Generation failed</h2>
          <p class="text-body text-text-secondary">
            {{ doc.error ?? 'The compliance worker reported an error.' }}
          </p>
          <NuxtLink
            :to="`/admin/properties/${propertyId}/compliance/new`"
            class="inline-flex h-input self-start items-center rounded-input border border-border-strong px-4 text-body font-medium text-text-primary hover:bg-surface-muted transition"
            data-testid="compliance-retry-link"
          >
            Try again
          </NuxtLink>
        </div>
      </BulwarkCard>

      <p
        v-if="error"
        class="mt-3 text-body-sm text-status-error"
        data-testid="compliance-poll-error"
      >
        {{ error }}
      </p>
    </template>
  </div>
</template>
