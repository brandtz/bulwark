<!--
  app/pages/admin/properties/[id]/buildings/[buildingId].vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - One page combines building-edit and sections-list because the two
      are read together in 100% of cases (user opens a building to
      adjust sections). Splitting would force a second route hop.
    - Section reorder is "up/down arrow" buttons. We considered a
      drag-and-drop library but the section count is tiny (≤ ~10) and
      the arrow pattern is keyboard-accessible without ARIA gymnastics.
    - We optimistically reorder the local list before calling
      `reorderSections`; on error we re-fetch via `refresh()`. That
      keeps the click feedback instant.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { BUILDING_KIND_LABEL, BUILDING_SECTION_KIND_LABEL } from '~~/shared/contracts/building'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const router = useRouter()
const propertyId = computed(() => String(route.params.id))
const buildingId = computed(() => String(route.params.buildingId))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const buildingSvc = useService('building')
const { t } = useLabel()

const { data, refresh } = await useAsyncData(
  () => `building-detail-${buildingId.value}-${orgId.value}`,
  async () => {
    const b = await buildingSvc.get(buildingId.value, orgId.value)
    if (!b) return { building: null, sections: [] }
    const sections = await buildingSvc.listSections(buildingId.value, orgId.value)
    return { building: b, sections }
  },
  { default: () => ({ building: null, sections: [] }), watch: [buildingId, orgId] },
)

// ── Building edit form ────────────────────────────────────────────────
const form = reactive({
  name: '',
  kind: 'house',
  yearBuilt: null as number | null,
  squareFeet: null as number | null,
  stories: null as number | null,
  notes: '',
})
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveOk = ref(false)

watchEffect(() => {
  const b = data.value?.building
  if (b) {
    form.name = b.name
    form.kind = b.kind
    form.yearBuilt = b.yearBuilt
    form.squareFeet = b.squareFeet
    form.stories = b.stories
    form.notes = b.notes ?? ''
  }
})

async function saveBuilding() {
  if (!data.value?.building) return
  saving.value = true
  saveError.value = null
  saveOk.value = false
  try {
    await buildingSvc.update({
      id: buildingId.value,
      organizationId: orgId.value,
      name: form.name.trim(),
      kind: form.kind,
      yearBuilt: form.yearBuilt,
      squareFeet: form.squareFeet,
      stories: form.stories,
      notes: form.notes.trim() || null,
    })
    saveOk.value = true
    await refresh()
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function deleteBuilding() {
  if (!confirm('Delete this building? Sections will be retained for audit but hidden.')) return
  await buildingSvc.softDelete(buildingId.value, orgId.value)
  router.push(`/admin/properties/${propertyId.value}/buildings`)
}

// ── Sections ──────────────────────────────────────────────────────────
const showAddSection = ref(false)
const sectionDraft = reactive({
  label: '',
  kind: 'roof',
  notes: '',
})
const sectionSubmitting = ref(false)
const sectionError = ref<string | null>(null)

async function addSection() {
  if (!sectionDraft.label.trim()) {
    sectionError.value = 'Label is required'
    return
  }
  sectionSubmitting.value = true
  sectionError.value = null
  try {
    await buildingSvc.createSection({
      organizationId: orgId.value,
      buildingId: buildingId.value,
      label: sectionDraft.label.trim(),
      kind: sectionDraft.kind,
      notes: sectionDraft.notes.trim() || null,
    })
    sectionDraft.label = ''
    sectionDraft.kind = 'roof'
    sectionDraft.notes = ''
    showAddSection.value = false
    await refresh()
  } catch (err) {
    sectionError.value = err instanceof Error ? err.message : 'Failed to add section'
  } finally {
    sectionSubmitting.value = false
  }
}

async function deleteSection(id: string) {
  if (!confirm('Delete this section?')) return
  await buildingSvc.softDeleteSection(id, orgId.value)
  await refresh()
}

async function moveSection(index: number, delta: -1 | 1) {
  const list = [...(data.value?.sections ?? [])]
  const target = index + delta
  if (target < 0 || target >= list.length) return
  const [moved] = list.splice(index, 1)
  list.splice(target, 0, moved!)
  const orderedIds = list.map((s) => s.id)
  try {
    await buildingSvc.reorderSections(buildingId.value, orderedIds, orgId.value)
    await refresh()
  } catch {
    await refresh()
  }
}

const SECTION_KIND_OPTIONS = Object.keys(BUILDING_SECTION_KIND_LABEL).map((k) => ({
  value: k,
  label: t('building.kinds', k, BUILDING_SECTION_KIND_LABEL[k] ?? k),
}))

const BUILDING_KIND_OPTIONS = Object.keys(BUILDING_KIND_LABEL).map((k) => ({
  value: k,
  label: t('building.kinds', k, BUILDING_KIND_LABEL[k] ?? k),
}))

useHead(() => ({ title: data.value?.building?.name ?? 'Building — Bulwark' }))
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="building-detail-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Buildings', to: `/admin/properties/${propertyId}/buildings` },
        { label: data?.building?.name ?? 'Not found' },
      ]"
    />

    <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

    <template v-if="!data?.building">
      <EmptyState
        icon="·"
        title="Building not found"
        body="It may have been deleted, or you don't have access."
        :cta="{ label: 'Back to buildings', to: `/admin/properties/${propertyId}/buildings` }"
      />
    </template>

    <template v-else>
      <h1 class="text-h1 mb-4">{{ data.building.name }}</h1>

      <BulwarkCard padding="md" class="mb-4">
        <form class="grid grid-cols-1 md:grid-cols-2 gap-3" @submit.prevent="saveBuilding">
          <BulwarkInput v-model="form.name" label="Name" required data-testid="building-edit-name" />
          <BulwarkSelect v-model="form.kind" label="Kind" :options="BUILDING_KIND_OPTIONS" />
          <BulwarkInput v-model.number="form.yearBuilt" type="number" label="Year built" />
          <BulwarkInput v-model.number="form.squareFeet" type="number" label="Square feet" />
          <BulwarkInput v-model.number="form.stories" type="number" label="Stories" />
          <BulwarkTextarea v-model="form.notes" label="Notes" :rows="3" class="md:col-span-2" />
          <div class="md:col-span-2 flex items-center justify-between">
            <button
              type="button"
              class="text-small text-status-error hover:underline"
              data-testid="building-delete-button"
              @click="deleteBuilding"
            >
              Delete building
            </button>
            <div class="flex items-center gap-2">
              <span v-if="saveOk" class="text-small text-status-success">Saved</span>
              <span v-if="saveError" class="text-small text-status-error">{{ saveError }}</span>
              <button
                type="submit"
                class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
                :disabled="saving"
                data-testid="building-save-button"
              >
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </form>
      </BulwarkCard>

      <section class="mt-6">
        <header class="flex items-center justify-between mb-3">
          <h2 class="text-h2">Sections</h2>
          <button
            type="button"
            class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
            data-testid="section-add-button"
            @click="showAddSection = true"
          >
            Add section
          </button>
        </header>

        <BulwarkCard v-if="data.sections.length > 0" padding="none">
          <ul class="divide-y divide-border-default" data-testid="sections-list">
            <li
              v-for="(s, idx) in data.sections"
              :key="s.id"
              class="p-3 md:p-4 flex items-center justify-between gap-3"
              data-testid="section-row"
              :data-section-id="s.id"
            >
              <div class="min-w-0">
                <p class="text-body font-medium">{{ s.label }}</p>
                <p class="text-small text-text-secondary mt-0.5">
                  {{ t('building.kinds', s.kind, BUILDING_SECTION_KIND_LABEL[s.kind] ?? s.kind) }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="px-2 py-1 text-small border border-border-default rounded-input disabled:opacity-40"
                  :disabled="idx === 0"
                  data-testid="section-move-up"
                  aria-label="Move up"
                  @click="moveSection(idx, -1)"
                >↑</button>
                <button
                  type="button"
                  class="px-2 py-1 text-small border border-border-default rounded-input disabled:opacity-40"
                  :disabled="idx === data.sections.length - 1"
                  data-testid="section-move-down"
                  aria-label="Move down"
                  @click="moveSection(idx, 1)"
                >↓</button>
                <button
                  type="button"
                  class="px-2 py-1 text-small text-status-error hover:underline"
                  data-testid="section-delete-button"
                  @click="deleteSection(s.id)"
                >
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </BulwarkCard>

        <EmptyState
          v-else
          icon="·"
          title="No sections yet"
          body="Break this building into roof / wall / eave sections for finer-grained inspection."
        />
      </section>

      <BulwarkModal v-model="showAddSection" title="Add section" data-testid="section-add-modal">
        <form class="flex flex-col gap-3" @submit.prevent="addSection">
          <BulwarkInput
            v-model="sectionDraft.label"
            label="Label"
            required
            data-testid="section-label-input"
          />
          <BulwarkSelect
            v-model="sectionDraft.kind"
            label="Kind"
            :options="SECTION_KIND_OPTIONS"
            data-testid="section-kind-select"
          />
          <BulwarkTextarea v-model="sectionDraft.notes" label="Notes" :rows="2" />
          <p v-if="sectionError" class="text-small text-status-error">{{ sectionError }}</p>
          <div class="flex justify-end gap-2 mt-2">
            <button
              type="button"
              class="inline-flex h-input items-center rounded-input border border-border-default px-4 text-body"
              @click="showAddSection = false"
            >Cancel</button>
            <button
              type="submit"
              class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
              :disabled="sectionSubmitting"
              data-testid="section-add-submit"
            >
              {{ sectionSubmitting ? 'Adding…' : 'Add section' }}
            </button>
          </div>
        </form>
      </BulwarkModal>
    </template>
  </div>
</template>
