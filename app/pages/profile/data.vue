<!--
  app/pages/profile/data.vue — user-facing DSR controls
  (W5-4 / Privacy + Compliance / ADR-0038).

  # What this page does
    - Two cards for the current user:
      * Export my data → triggers /api/account/export download.
      * Delete my account → confirm modal, warns about 30-day
        soft-delete, calls /api/account/delete then logs out and
        redirects to /goodbye.

  # Decisions (ADR-0008, ADR-0038)
    - Self-service. No admin path. An admin's "delete another user"
      flow continues to live in /admin/users.
    - Confirm via native window.confirm + an explicit "type DELETE to
      proceed" gate so a mis-click can't nuke an account.
    - 409 SOLE_ADMIN → render a hint linking to the user management
      surface where the user can transfer ownership.
-->
<script setup lang="ts">
import { ref, computed } from 'vue'

definePageMeta({})
useHead({ title: 'Account & data' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const { logout } = useAuth()
const { success: toastSuccess, error: toastError } = useToast()

const exporting = ref(false)
const deleting = ref(false)
const confirmText = ref('')
const showConfirm = ref(false)
const soleAdminOrgs = ref<string[] | null>(null)

const userId = computed(() => session.value?.userId ?? '')
const userEmail = computed(() => session.value?.email ?? '')

async function downloadExport() {
  if (!userId.value) return
  exporting.value = true
  try {
    const res = await $fetch.raw<Blob>('/api/account/export', {
      method: 'GET',
      responseType: 'blob',
    })
    const blob = res._data as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = new Date().toISOString().slice(0, 10)
    a.download = `bulwark-export-${userId.value}-${date}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toastSuccess('Export ready', 'Your data has been downloaded.')
  } catch (err) {
    toastError('Export failed', (err as Error).message)
  } finally {
    exporting.value = false
  }
}

async function confirmAndDelete() {
  if (confirmText.value.trim().toUpperCase() !== 'DELETE') {
    toastError('Type DELETE to confirm', 'Confirmation text didn\u2019t match.')
    return
  }
  deleting.value = true
  soleAdminOrgs.value = null
  try {
    await $fetch('/api/account/delete', {
      method: 'POST',
      body: { reason: 'user_initiated' },
    })
    await logout()
    await navigateTo('/goodbye')
  } catch (err) {
    const data = (err as { data?: { code?: string; organizationIds?: string[] } }).data
    if (data?.code === 'SOLE_ADMIN') {
      soleAdminOrgs.value = data.organizationIds ?? []
      toastError(
        'Cannot delete yet',
        'You\u2019re the only admin for one or more organizations. Transfer ownership first.',
      )
    } else {
      toastError('Deletion failed', (err as Error).message)
    }
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-8 space-y-6">
    <header>
      <h1 class="text-h1 font-semibold">Account &amp; data</h1>
      <p class="text-small text-text-secondary mt-1">
        Manage your personal data: download a copy, or request deletion.
      </p>
    </header>

    <!-- Export card -->
    <section
      class="bg-surface border border-border rounded-card p-5"
      data-testid="account-export-card"
    >
      <h2 class="text-h2 font-semibold mb-2">Export my data</h2>
      <p class="text-small text-text-secondary mb-4">
        Download a JSON file containing the personal data we hold about
        you: your profile, organization memberships, notifications,
        notification preferences, and the audit-log entries you
        authored. Other users&rsquo; data appearing in your history is
        redacted. See the
        <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>
        for details.
      </p>
      <button
        type="button"
        class="rounded-input bg-primary text-white px-4 py-2 text-small disabled:opacity-50"
        :disabled="exporting"
        data-testid="account-export-button"
        @click="downloadExport"
      >
        {{ exporting ? 'Preparing…' : 'Download my data' }}
      </button>
    </section>

    <!-- Delete card -->
    <section
      class="bg-surface border border-danger/40 rounded-card p-5"
      data-testid="account-delete-card"
    >
      <h2 class="text-h2 font-semibold mb-2 text-danger">Delete my account</h2>
      <p class="text-small text-text-secondary mb-3">
        Deletion is a two-step process:
      </p>
      <ul class="text-small text-text-secondary list-disc pl-6 mb-4 space-y-1">
        <li>
          Your account is <strong>immediately disabled</strong> and
          your personal data (name, phone, avatar) is removed from
          our active systems.
        </li>
        <li>
          After a <strong>30-day grace period</strong>, the remaining
          records are permanently deleted. Contact us during this
          window to reverse the request.
        </li>
        <li>
          Records we are legally required to retain (e.g., financial
          and audit logs) remain, with your identifying information
          removed.
        </li>
      </ul>

      <div v-if="soleAdminOrgs && soleAdminOrgs.length > 0" class="mb-4 rounded-input border border-warning bg-warning/10 px-3 py-2 text-small">
        You&rsquo;re the only admin for {{ soleAdminOrgs.length }} organization(s).
        <NuxtLink to="/admin/users" class="text-primary underline">Transfer admin role</NuxtLink>
        first, then retry deletion.
      </div>

      <div v-if="!showConfirm">
        <button
          type="button"
          class="rounded-input border border-danger text-danger px-4 py-2 text-small"
          data-testid="account-delete-show-confirm"
          @click="showConfirm = true"
        >
          Request deletion…
        </button>
      </div>

      <div v-else class="space-y-3" data-testid="account-delete-confirm">
        <p class="text-small text-text-primary">
          Signed in as <strong>{{ userEmail }}</strong>. Type
          <code>DELETE</code> to confirm.
        </p>
        <input
          v-model="confirmText"
          type="text"
          class="w-full max-w-xs rounded-input border border-border bg-background px-3 py-2 text-small"
          data-testid="account-delete-confirm-input"
          placeholder="DELETE"
        >
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-input bg-danger text-white px-4 py-2 text-small disabled:opacity-50"
            :disabled="deleting"
            data-testid="account-delete-confirm-button"
            @click="confirmAndDelete"
          >
            {{ deleting ? 'Deleting…' : 'Confirm deletion' }}
          </button>
          <button
            type="button"
            class="rounded-input border border-border px-4 py-2 text-small"
            data-testid="account-delete-cancel"
            @click="showConfirm = false; confirmText = ''"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
