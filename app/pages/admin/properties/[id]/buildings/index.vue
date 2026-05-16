<!--
  app/pages/admin/properties/[id]/buildings/index.vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - Table of all buildings for the property + inline "Add building"
      modal. The modal is local to this page because the form is small
      and per-page-state-keeping a drawer/route is heavier than the
      payoff.
    - Building kinds come from the label registry (namespace
      'building.kinds') so an org can rename "Detached garage" → "Shop"
      without code change; we keep the kind value as a free-string,
      not an enum, to honor ADR-0014.
    - Refresh after mutation uses `refresh()` on the useAsyncData — we
      don't optimistically patch the list because the row mappers and
      sort order are cheaper to reconcile from a single source of truth.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { BUILDING_KIND_LABEL } from '~~/shared/contracts/building'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const buildingSvc = useService('building')
const { t } = useLabel()

const { data: buildings, refresh } = await useAsyncData(
  () => `buildings-${propertyId.value}-${orgId.value}`,
  () => buildingSvc.listForProperty(propertyId.value, orgId.value),
  { default: () => [], watch: [propertyId, orgId] },
)

const showCreate = ref(false)
const draft = reactive({
  name: '',
  kind: 'house',
  yearBuilt: null as number | null,
  squareFeet: null as number | null,
  stories: null as number | null,
  notes: '',
})
const submitting = ref(false)
const submitError = ref<string | null>(null)

function resetDraft() {
  draft.name = ''
  draft.kind = 'house'
  draft.yearBuilt = null
  draft.squareFeet = null
  draft.stories = null
  draft.notes = ''
  submitError.value = null
}

async function submit() {
  if (!draft.name.trim()) {
    submitError.value = 'Name is required'
    return
  }
  submitting.value = true
  submitError.value = null
  try {
    await buildingSvc.create({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      name: draft.name.trim(),
      kind: draft.kind,
      yearBuilt: draft.yearBuilt,
      squareFeet: draft.squareFeet,
      stories: draft.stories,
      notes: draft.notes.trim() || null,
    })
    showCreate.value = false
    resetDraft()
    await refresh()
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to create building'
  } finally {
    submitting.value = false
  }
}

const KIND_OPTIONS = Object.keys(BUILDING_KIND_LABEL).map((k) => ({
  value: k,
  label: t('building.kinds', k, BUILDING_KIND_LABEL[k] ?? k),
}))

useHead({ title: 'Buildings — Bulwark' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="property-buildings-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: t('property.tabs', 'buildings', 'Buildings') },
      ]"
    />

    <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-h1">{{ t('property.tabs', 'buildings', 'Buildings') }}</h1>
      <button
        type="button"
        class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
        data-testid="building-add-button"
        @click="showCreate = true"
      >
        Add building
      </button>
    </header>

    <BulwarkCard v-if="buildings && buildings.length > 0" padding="none">
      <table class="w-full text-body" data-testid="buildings-table">
        <thead class="text-small text-text-secondary border-b border-border-default">
          <tr>
            <th class="text-left p-3">Name</th>
            <th class="text-left p-3">Kind</th>
            <th class="text-right p-3">Sq ft</th>
            <th class="text-right p-3">Year</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in buildings"
            :key="b.id"
            class="border-b border-border-default last:border-0"
            data-testid="building-row"
            :data-building-id="b.id"
          >
            <td class="p-3">
              <NuxtLink
                :to="`/admin/properties/${propertyId}/buildings/${b.id}`"
                class="text-primary hover:underline"
              >
                {{ b.name }}
              </NuxtLink>
            </td>
            <td class="p-3 text-text-secondary">
              {{ t('building.kinds', b.kind, BUILDING_KIND_LABEL[b.kind] ?? b.kind) }}
            </td>
            <td class="p-3 text-right">{{ b.squareFeet ?? '—' }}</td>
            <td class="p-3 text-right">{{ b.yearBuilt ?? '—' }}</td>
            <td class="p-3 text-right">
              <NuxtLink
                :to="`/admin/properties/${propertyId}/buildings/${b.id}`"
                class="text-small text-primary hover:underline"
              >
                Open →
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </BulwarkCard>

    <EmptyState
      v-else
      icon="·"
      title="No buildings yet"
      body="Add the first building to describe its kind, size, and sections."
      data-testid="buildings-empty-state"
    />

    <BulwarkModal v-model="showCreate" title="Add building" data-testid="building-create-modal">
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <BulwarkInput
          v-model="draft.name"
          label="Name"
          required
          data-testid="building-name-input"
        />
        <BulwarkSelect
          v-model="draft.kind"
          label="Kind"
          :options="KIND_OPTIONS"
          data-testid="building-kind-select"
        />
        <div class="grid grid-cols-3 gap-3">
          <BulwarkInput
            v-model.number="draft.yearBuilt"
            type="number"
            label="Year built"
            data-testid="building-year-input"
          />
          <BulwarkInput
            v-model.number="draft.squareFeet"
            type="number"
            label="Square feet"
            data-testid="building-sqft-input"
          />
          <BulwarkInput
            v-model.number="draft.stories"
            type="number"
            label="Stories"
            data-testid="building-stories-input"
          />
        </div>
        <BulwarkTextarea
          v-model="draft.notes"
          label="Notes"
          :rows="3"
        />
        <p v-if="submitError" class="text-small text-status-error" data-testid="building-create-error">{{ submitError }}</p>
        <div class="flex justify-end gap-2 mt-2">
          <button
            type="button"
            class="inline-flex h-input items-center rounded-input border border-border-default px-4 text-body"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
            :disabled="submitting"
            data-testid="building-create-submit"
          >
            {{ submitting ? 'Creating…' : 'Create building' }}
          </button>
        </div>
      </form>
    </BulwarkModal>
  </div>
</template>
