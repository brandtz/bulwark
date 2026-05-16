<!--
  app/pages/admin/properties/[id]/photos.vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - Gallery is a Tailwind grid (`grid grid-cols-2 md:grid-cols-4`)
      because the photo set is bounded (≤ a few dozen per property);
      virtualisation isn't worth the API surface.
    - Upload uses `FileReader.readAsDataURL` and posts the data URL to
      the photo service — the real service stores it as-is for now.
      W3-1 will swap that for a sealed-secret S3/R2 signed-URL flow.
      The TODO marker lives in the service, not the page.
    - Filter chips by building / section are derived from the live
      photo list (only chips for buildings/sections that have ≥1 photo)
      to avoid a separate fetch.
    - Caption edit is inline (single-line text + Save button); we don't
      ship rich text here.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { safeUrl } from '~/utils/safeUrl'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const photoSvc = useService('propertyPhoto')
const buildingSvc = useService('building')
const { t } = useLabel()

const { data, refresh } = await useAsyncData(
  () => `photos-${propertyId.value}-${orgId.value}`,
  async () => {
    const [photos, buildings] = await Promise.all([
      photoSvc.listForProperty(propertyId.value, orgId.value),
      buildingSvc.listForProperty(propertyId.value, orgId.value),
    ])
    return { photos, buildings }
  },
  { default: () => ({ photos: [], buildings: [] }), watch: [propertyId, orgId] },
)

// ── Filter chips ──────────────────────────────────────────────────────
const filter = ref<string>('all')

const filteredPhotos = computed(() => {
  const list = data.value?.photos ?? []
  if (filter.value === 'all') return list
  if (filter.value === 'unassigned') return list.filter((p) => !p.buildingId)
  return list.filter((p) => p.buildingId === filter.value)
})

const buildingFilterChips = computed(() => {
  const photos = data.value?.photos ?? []
  const buildings = data.value?.buildings ?? []
  const counts = new Map<string, number>()
  for (const p of photos) {
    const key = p.buildingId ?? 'unassigned'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const chips: { value: string; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: photos.length },
  ]
  for (const b of buildings) {
    const n = counts.get(b.id) ?? 0
    if (n > 0) chips.push({ value: b.id, label: b.name, count: n })
  }
  const unassigned = counts.get('unassigned') ?? 0
  if (unassigned > 0) chips.push({ value: 'unassigned', label: 'Unassigned', count: unassigned })
  return chips
})

// ── Upload (data URL, W3-1 will swap to signed URL) ──────────────────
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = null
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
    await photoSvc.create({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      buildingId: null,
      sectionId: null,
      url: dataUrl,
      thumbnailUrl: null,
      caption: null,
      takenAt: null,
    })
    await refresh()
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// ── Inline caption edit ──────────────────────────────────────────────
const editingCaption = ref<string | null>(null)
const captionDraft = ref('')

function startEditCaption(id: string, current: string | null) {
  editingCaption.value = id
  captionDraft.value = current ?? ''
}

async function saveCaption(id: string) {
  await photoSvc.update({ id, organizationId: orgId.value, caption: captionDraft.value.trim() || null })
  editingCaption.value = null
  await refresh()
}

async function deletePhoto(id: string) {
  if (!confirm('Delete this photo?')) return
  await photoSvc.softDelete(id, orgId.value)
  await refresh()
}

useHead({ title: 'Photos — Bulwark' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-6xl mx-auto" data-testid="property-photos-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: t('property.tabs', 'photos', 'Photos') },
      ]"
    />

    <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-h1">{{ t('property.tabs', 'photos', 'Photos') }}</h1>
      <label
        class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition cursor-pointer"
        data-testid="photo-upload-label"
      >
        {{ uploading ? 'Uploading…' : 'Upload photo' }}
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          data-testid="photo-upload-input"
          @change="onFileChange"
        >
      </label>
    </header>

    <p v-if="uploadError" class="text-small text-status-error mb-3" data-testid="photo-upload-error">{{ uploadError }}</p>

    <nav v-if="buildingFilterChips.length > 1" class="flex flex-wrap gap-2 mb-4" data-testid="photo-filter-chips">
      <button
        v-for="chip in buildingFilterChips"
        :key="chip.value"
        type="button"
        :class="[
          'inline-flex items-center rounded-pill px-3 py-1 text-small border',
          filter === chip.value
            ? 'bg-primary text-white border-primary'
            : 'bg-surface-muted text-text-secondary border-border-default hover:text-text-primary',
        ]"
        :data-chip="chip.value"
        @click="filter = chip.value"
      >
        {{ chip.label }} · {{ chip.count }}
      </button>
    </nav>

    <section
      v-if="filteredPhotos.length > 0"
      class="grid grid-cols-2 md:grid-cols-4 gap-3"
      data-testid="photos-grid"
    >
      <article
        v-for="p in filteredPhotos"
        :key="p.id"
        class="rounded-card border border-border-default overflow-hidden bg-surface-muted"
        data-testid="photo-tile"
        :data-photo-id="p.id"
      >
        <img :src="safeUrl(p.thumbnailUrl ?? p.url) ?? '/icons/sprite.svg#bw-image'" :alt="p.caption ?? 'Property photo'" class="w-full aspect-square object-cover" loading="lazy">
        <div class="p-2">
          <template v-if="editingCaption === p.id">
            <input
              v-model="captionDraft"
              class="w-full text-small border border-border-default rounded-input px-2 py-1"
              data-testid="photo-caption-input"
            />
            <div class="flex justify-end gap-2 mt-1">
              <button
                type="button"
                class="text-small text-text-secondary hover:underline"
                @click="editingCaption = null"
              >Cancel</button>
              <button
                type="button"
                class="text-small text-primary hover:underline"
                data-testid="photo-caption-save"
                @click="saveCaption(p.id)"
              >Save</button>
            </div>
          </template>
          <template v-else>
            <p class="text-small text-text-secondary truncate" :title="p.caption ?? ''">
              {{ p.caption ?? 'No caption' }}
            </p>
            <div class="flex justify-between mt-1">
              <button
                type="button"
                class="text-small text-primary hover:underline"
                data-testid="photo-caption-edit"
                @click="startEditCaption(p.id, p.caption)"
              >Edit</button>
              <button
                type="button"
                class="text-small text-status-error hover:underline"
                data-testid="photo-delete"
                @click="deletePhoto(p.id)"
              >Delete</button>
            </div>
          </template>
        </div>
      </article>
    </section>

    <EmptyState
      v-else
      icon="·"
      title="No photos yet"
      body="Upload property photos here. They can later be linked to specific buildings and sections."
      data-testid="photos-empty-state"
    />
  </div>
</template>
