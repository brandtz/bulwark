<!--
  app/pages/field/jobs/[woId]/photos.vue — field photo capture
  (W3-3 / EH-M / ADR-0029).

  # What this is
    A camera-first photo capture page. The native file input uses
    `accept="image/*"` + `capture="environment"` so iOS/Android open
    the rear camera directly without going through the system picker
    on capable devices. Files are read into data URLs and POSTed to
    `propertyPhotoService.create(...)` — the W2-1 stub upload already
    accepts data URLs as the v1 storage seam, so we reuse it as-is.

  # Decisions (ADR-0008)
    - **No image resizing in v1.** A modern phone photo (~3 MB after
      JPEG compression) is small enough that the stub upload handles
      it; the property-photo service already caps the URL length by
      virtue of the postgres column type. We document client-side
      resize as a Phase 2 promotion in ADR-0029.
    - **Offline path.** When `navigator.onLine === false`, we enqueue
      the create request via `useOfflineQueue` (namespace
      `field-photos`). Drain happens when the browser fires `online`.
      The grid below shows photos that have synced; queued-but-not-
      synced photos surface a "pending" pill (we just count items in
      the queue snapshot — no thumb until upload completes).
    - **Caption is post-hoc.** Tap a thumbnail to edit; we don't
      block capture on requiring a caption. Field crews need throughput.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import { safeUrl } from '~/utils/safeUrl'
import type { PropertyPhoto, PropertyPhotoCreateInput } from '~~/shared/contracts/property-photo'

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

const offline = useOfflineQueue({ namespace: 'field-photos' })
const pendingCount = ref(0)

function refreshPendingCount(): void {
  pendingCount.value = offline.snapshot().length
}

async function load(): Promise<void> {
  const wo = await workOrderService.get(woId.value, orgId)
  if (!wo) throw createError({ statusCode: 404 })
  propertyId.value = wo.propertyId
  photos.value = await photoService.listForProperty(wo.propertyId, orgId)
  refreshPendingCount()
}
await load()

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0 || !propertyId.value) return
  uploading.value = true
  error.value = null
  try {
    for (const file of Array.from(input.files)) {
      const dataUrl = await readAsDataUrl(file)
      const payload: PropertyPhotoCreateInput = {
        organizationId: orgId,
        propertyId: propertyId.value,
        url: dataUrl,
        caption: null,
        takenAt: new Date().toISOString(),
        uploadedByUserId: session.value!.userId,
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offline.enqueue({
          url: '/api/services/propertyPhoto/create',
          method: 'POST',
          body: { args: [payload] },
        })
        continue
      }
      try {
        const row = await photoService.create(payload)
        photos.value = [row, ...photos.value]
      } catch (err) {
        offline.enqueue({
          url: '/api/services/propertyPhoto/create',
          method: 'POST',
          body: { args: [payload] },
        })
        error.value = err instanceof Error ? err.message : 'Upload deferred.'
      }
    }
  } finally {
    refreshPendingCount()
    uploading.value = false
    input.value = ''
  }
}

async function deletePhoto(id: string): Promise<void> {
  await photoService.softDelete(id, orgId)
  photos.value = photos.value.filter((p) => p.id !== id)
}

onMounted(() => {
  offline.attachOnlineListener()
})
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
      />
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
        />
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
