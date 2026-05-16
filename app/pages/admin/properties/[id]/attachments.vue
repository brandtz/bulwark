<!--
  app/pages/admin/properties/[id]/attachments.vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - Attachments differ from photos in two ways: there's no thumbnail
      grid (PDFs / docs aren't visually scanned), and there is no update
      — once uploaded, you delete-and-reupload rather than mutate
      metadata. The contract reflects this by omitting `update()`.
    - Upload uses data URL today; W3-1 will swap for sealed-secret
      signed-URL flow. TODO marker lives in the service.
    - Kind comes from the label registry ('attachment.kinds') so an
      org can rename "Permit" → "Approval doc" per ADR-0014.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { safeUrl } from '~/utils/safeUrl'
import { ATTACHMENT_KIND_LABEL } from '~~/shared/contracts/property-attachment'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const attachSvc = useService('propertyAttachment')
const { t } = useLabel()

const { data: attachments, refresh } = await useAsyncData(
  () => `attachments-${propertyId.value}-${orgId.value}`,
  () => attachSvc.listForProperty(propertyId.value, orgId.value),
  { default: () => [], watch: [propertyId, orgId] },
)

const uploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const draftKind = ref<string>('document')

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
    await attachSvc.create({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      kind: draftKind.value,
      name: file.name,
      url: dataUrl,
    })
    await refresh()
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function deleteAttachment(id: string) {
  if (!confirm('Delete this attachment?')) return
  await attachSvc.softDelete(id, orgId.value)
  await refresh()
}

const KIND_OPTIONS = Object.keys(ATTACHMENT_KIND_LABEL).map((k) => ({
  value: k,
  label: t('attachment.kinds', k, ATTACHMENT_KIND_LABEL[k] ?? k),
}))

useHead({ title: 'Attachments — Bulwark' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="property-attachments-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: t('property.tabs', 'attachments', 'Attachments') },
      ]"
    />

    <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-h1">{{ t('property.tabs', 'attachments', 'Attachments') }}</h1>
      <div class="flex items-center gap-2">
        <BulwarkSelect
          v-model="draftKind"
          label=""
          :options="KIND_OPTIONS"
          data-testid="attachment-kind-select"
        />
        <label
          class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition cursor-pointer"
          data-testid="attachment-upload-label"
        >
          {{ uploading ? 'Uploading…' : 'Upload file' }}
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            data-testid="attachment-upload-input"
            @change="onFileChange"
          >
        </label>
      </div>
    </header>

    <p v-if="uploadError" class="text-small text-status-error mb-3" data-testid="attachment-upload-error">{{ uploadError }}</p>

    <BulwarkCard v-if="attachments && attachments.length > 0" padding="none">
      <table class="w-full text-body" data-testid="attachments-table">
        <thead class="text-small text-text-secondary border-b border-border-default">
          <tr>
            <th class="text-left p-3">File</th>
            <th class="text-left p-3">Kind</th>
            <th class="text-left p-3">Uploaded</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in attachments"
            :key="a.id"
            class="border-b border-border-default last:border-0"
            data-testid="attachment-row"
            :data-attachment-id="a.id"
          >
            <td class="p-3">
              <a
                :href="safeUrl(a.url) ?? '#'"
                :download="a.name"
                class="text-primary hover:underline"
                target="_blank"
                rel="noopener"
                data-testid="attachment-download"
              >
                {{ a.name }}
              </a>
            </td>
            <td class="p-3">
              <span class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-small">
                {{ t('attachment.kinds', a.kind, ATTACHMENT_KIND_LABEL[a.kind] ?? a.kind) }}
              </span>
            </td>
            <td class="p-3 text-text-secondary">{{ a.createdAt.slice(0, 10) }}</td>
            <td class="p-3 text-right">
              <button
                type="button"
                class="text-small text-status-error hover:underline"
                data-testid="attachment-delete"
                @click="deleteAttachment(a.id)"
              >Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </BulwarkCard>

    <EmptyState
      v-else
      icon="·"
      title="No attachments yet"
      body="Upload permits, inspection reports, insurance documents, and other files for this property."
      data-testid="attachments-empty-state"
    />
  </div>
</template>
