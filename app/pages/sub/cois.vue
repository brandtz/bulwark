<!--
  app/pages/sub/cois.vue — list a sub's COI documents and let them
  upload a new one (W3-4 / EH-N / ADR-0031).

  # Decisions
    - The "upload" path is a minimal URL+filename+expiry form. We
      deliberately don't ship a real file picker here — the storage
      provider is wired separately (see compliance/uploadDoc). This
      mirror is for typed-in URLs from the field team's previous
      uploads and keeps the contract uniform.
    - Rows render expiry status (active/expiring/expired) using the
      same 30-day window as `scanCoiExpiry`.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

useHead({ title: 'My COIs' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const sub = useService('subcontractor')

const subId = ref<string | null>(null)
const rows = ref<Awaited<ReturnType<typeof sub.listCois>>>([])
const submitting = ref(false)

const form = reactive({
  fileUrl: '',
  fileName: '',
  expiresAt: '',
  notes: '',
})

async function refresh(): Promise<void> {
  if (!orgId.value || !userId.value) return
  const resolved = await sub.resolveSubForUser(userId.value, orgId.value)
  subId.value = resolved?.subcontractorId ?? null
  if (!subId.value) return
  rows.value = await sub.listCois(subId.value, orgId.value)
}

await refresh()

function expiryBucket(iso: string): 'expired' | 'expiring' | 'active' {
  const d = new Date(iso).getTime()
  const now = Date.now()
  const days = (d - now) / 86_400_000
  if (days < 0) return 'expired'
  if (days < 30) return 'expiring'
  return 'active'
}

async function upload(): Promise<void> {
  if (!subId.value || !orgId.value) return
  if (!form.fileUrl || !form.fileName || !form.expiresAt) return
  submitting.value = true
  try {
    await sub.uploadCoi({
      organizationId: orgId.value,
      subcontractorId: subId.value,
      fileUrl: form.fileUrl,
      fileName: form.fileName,
      expiresAt: new Date(form.expiresAt).toISOString(),
      notes: form.notes || undefined,
    })
    form.fileUrl = ''
    form.fileName = ''
    form.expiresAt = ''
    form.notes = ''
    await refresh()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="sub-cois">
    <h1 class="text-display">My COIs</h1>
    <p class="text-body text-text-secondary mt-1">
      Keep your Certificate of Insurance current.
    </p>

    <BulwarkCard padding="md" class="mt-4" data-testid="sub-coi-upload">
      <h2 class="text-body font-semibold">Upload a new COI</h2>
      <form class="mt-3 space-y-3" @submit.prevent="upload">
        <label class="block text-small">File URL
          <input v-model="form.fileUrl" type="url" required class="mt-1 w-full h-input rounded-input border border-border px-2" data-testid="sub-coi-file-url" >
        </label>
        <label class="block text-small">File name
          <input v-model="form.fileName" type="text" required class="mt-1 w-full h-input rounded-input border border-border px-2" data-testid="sub-coi-file-name" >
        </label>
        <label class="block text-small">Expires
          <input v-model="form.expiresAt" type="date" required class="mt-1 w-full h-input rounded-input border border-border px-2" data-testid="sub-coi-expires" >
        </label>
        <label class="block text-small">Notes
          <textarea v-model="form.notes" class="mt-1 w-full rounded-input border border-border px-2 py-1" rows="2" />
        </label>
        <button
          type="submit"
          class="min-h-tap rounded-input bg-primary text-white px-4 disabled:opacity-50"
          :disabled="submitting"
          data-testid="sub-coi-submit"
        >Upload</button>
      </form>
    </BulwarkCard>

    <ul v-if="rows.length" class="mt-4 space-y-2" data-testid="sub-coi-list">
      <li v-for="row in rows" :key="row.id" :data-testid="`sub-coi-${row.id}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ row.fileName }}</p>
          <p class="text-small text-text-secondary mt-1">
            Expires {{ new Date(row.expiresAt).toLocaleDateString() }} ·
            <span :data-bucket="expiryBucket(row.expiresAt)">{{ expiryBucket(row.expiresAt) }}</span>
          </p>
        </BulwarkCard>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="sub-cois-empty"
      title="No COIs on file"
      body="Upload your Certificate of Insurance to keep working."
    />
  </div>
</template>
