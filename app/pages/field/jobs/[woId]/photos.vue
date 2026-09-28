<!--
  app/pages/field/jobs/[woId]/photos.vue — field photo capture
  (W3-3 / EH-M / ADR-0029; storage path WP-L02).

  # What this is
    A camera-first photo capture page. The native file input uses
    `accept="image/*"` + `capture="environment"` so iOS/Android open
    the rear camera directly without going through the system picker
    on capable devices. Each file goes through the storage service
    (presign → PUT → finalize, `uploadAsset`) and the finalized key is
    passed to `propertyPhotoService.create(...)`. data: URLs are no
    longer accepted by the service (WP-L02).

  # Decisions (ADR-0008)
    - **No image resizing in v1.** Documented as a Phase 2 promotion in
      ADR-0029.
    - **Offline path.** Captured files taken while offline (or whose
      upload fails) are held in memory and retried when the browser
      fires `online`. The "queued" pill counts them. They do not survive
      a reload — a durable (IndexedDB) blob queue belongs to WP-D2.
    - **Caption is post-hoc.** Tap a thumbnail to edit; we don't
      block capture on requiring a caption. Field crews need throughput.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'
import { uploadAsset } from '~/composables/useUpload'
import { safeUrl } from '~/utils/safeUrl'
import type { PropertyPhoto } from '~~/shared/contracts/property-photo'

definePageMeta({
  layout: 'field',
  middleware: 'field-role',
  fieldTitle: 'Photos',
})

const route = useRoute()
const woId = computed(() => route.params.woId as string)

const { t } = useLabel()
void t
const { session, ensureLoaded } = useSession()
await ensureLoaded()
if (!session.value) throw createError({ statusCode: 401 })
const orgId = session.value.activeOrganizationId

const workOrderService = useService('workOrder')
const photoService = useService('propertyPhoto')

const propertyId = ref<string | null>(null)
const photos = ref<PropertyPhoto[]>([])
const uploading = ref(false)
const error = ref<string | null>(null)

// Captures waiting for connectivity (memory only; see header).
const pending = shallowRef<Array<{ file: File, takenAt: string }>>([])
const pendingCount = computed(() => pending.value.length)

async function load(): Promise<void> {
  const wo = await workOrderService.get(woId.value, orgId)
  if (!wo) throw createError({ statusCode: 404 })
  propertyId.value = wo.propertyId
  photos.value = await photoService.listForProperty(wo.propertyId, orgId)
}
await load()

async function uploadOne(file: File, takenAt: string): Promise<void> {
  const asset = await uploadAsset({ organizationId: orgId, entity: 'property_photo', entityId: propertyId.value!, file })
  const row = await photoService.create({
    organizationId: orgId,
    propertyId: propertyId.value!,
    url: asset.key,
    caption: null,
    takenAt,
    uploadedByUserId: session.value!.userId,
  })
  photos.value = [row, ...photos.value]
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0 || !propertyId.value) return
  uploading.value = true
  error.value = null
  const deferred: Array<{ file: File, takenAt: string }> = []
  try {
    for (const file of Array.from(input.files)) {
      const takenAt = new Date().toISOString()
      if (isOffline()) {
        deferred.push({ file, takenAt })
        continue
      }
      try {
        await uploadOne(file, takenAt)
      } catch (err) {
        deferred.push({ file, takenAt })
        error.value = err instanceof Error ? err.message : 'Upload deferred.'
      }
    }
  } finally {
    if (deferred.length > 0) pending.value = [...pending.value, ...deferred]
    uploading.value = false
    input.value = ''
  }
}

async function flushPending(): Promise<void> {
  if (uploading.value || pending.value.length === 0 || isOffline()) return
  uploading.value = true
  const queue = pending.value
  pending.value = []
  const failed: typeof queue = []
  try {
    for (const item of queue) {
      try {
        await uploadOne(item.file, item.takenAt)
      } catch (err) {
        failed.push(item)
        error.value = err instanceof Error ? err.message : 'Upload deferred.'
      }
    }
  } finally {
    pending.value = [...failed, ...pending.value]
    uploading.value = false
  }
}

async function deletePhoto(id: string): Promise<void> {
  await photoService.softDelete(id, orgId)
  photos.value = photos.value.filter((p) => p.id !== id)
}

function onOnline(): void {
  void flushPending()
}
onMounted(() => window.addEventListener('online', onOnline))
onBeforeUnmount(() => window.removeEventListener('online', onOnline))
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-photos">
    <header class="flex items-center justify-between">
      <h1 class="text-display">Photos</h1>
      <span
        v-if="pendingCount > 0"
        class="text-tiny font-semibold px-2 py-1 rounded-full bg-status-warning/10 text-status-warning"
        data-testid="field-photos-pending"
      >
        {{ pendingCount }} queued
      </span>
    </header>

    <label
      class="mt-4 block min-h-tap rounded-card bg-primary text-white text-center py-3 font-semibold cursor-pointer"
      data-testid="field-photos-capture"
    >
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        class="hidden"
        :disabled="uploading"
        data-testid="field-photos-input"
        @change="onPick"
      >
      {{ uploading ? 'Uploading…' : 'Take photo' }}
    </label>

    <p v-if="error" class="mt-2 text-small text-status-error" data-testid="field-photos-error">
      {{ error }}
    </p>

    <ul
      v-if="photos.length > 0"
      class="mt-4 grid grid-cols-3 gap-2"
      data-testid="field-photos-grid"
    >
      <li
        v-for="photo in photos"
        :key="photo.id"
        class="relative aspect-square overflow-hidden rounded-input bg-surface-muted"
      >
        <img
          :src="safeUrl(photo.thumbnailUrl ?? photo.url) ?? '/icons/sprite.svg#bw-image'"
          :alt="photo.caption ?? 'Site photo'"
          class="w-full h-full object-cover"
        >
        <button
          type="button"
          class="absolute top-1 right-1 min-h-tap min-w-tap inline-flex items-center justify-center bg-surface/80 rounded-full text-status-error text-tiny font-bold"
          aria-label="Delete photo"
          data-testid="field-photo-delete"
          @click="() => deletePhoto(photo.id)"
        >
          ×
        </button>
      </li>
    </ul>
    <p
      v-else
      class="mt-6 text-body text-text-secondary text-center"
      data-testid="field-photos-empty"
    >
      No photos yet. Tap “Take photo” to start.
    </p>
  </div>
</template>
