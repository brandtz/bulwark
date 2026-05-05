<!--
  app/pages/settings/api-keys.vue — API key management (E9-S7).

  # Decisions (ADR-0008)
    - Issue-once UX: after creating a key, the raw secret is shown
      in a one-time banner with a copy button and a clear "you will
      not see this again" warning. After dismissing the banner,
      only the prefix remains.
    - Revoke is a soft action; the row stays in the list with a
      `Revoked` pill so audits stay legible.

  # Decision cast down
    - Rejected: a "regenerate" action. Issue + revoke covers the
      same ground without ambiguity over which key is canonical.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { ApiKey } from '~~/shared/contracts/api-key'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'API keys' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const apiKey = useService('apiKey')
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const rows = ref<ApiKey[]>([])
async function load() {
  rows.value = await apiKey.list(orgId.value)
}
await load()

const newLabel = ref('')
const creating = ref(false)
const justCreatedSecret = ref<{ label: string; secret: string } | null>(null)
const serverError = ref('')

async function onCreate() {
  if (!newLabel.value.trim()) return
  serverError.value = ''
  creating.value = true
  try {
    const result = await apiKey.create({
      organizationId: orgId.value,
      label: newLabel.value.trim(),
      createdById: session.value?.userId ?? null,
    })
    justCreatedSecret.value = { label: result.row.label, secret: result.secret }
    newLabel.value = ''
    await load()
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not issue key.'
  } finally {
    creating.value = false
  }
}

async function onRevoke(row: ApiKey) {
  serverError.value = ''
  try {
    await apiKey.revoke(row.id, orgId.value)
    toastSuccess('Key revoked', `${row.label} can no longer authenticate.`)
    await load()
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not revoke key.'
  }
}

function dismissSecret() {
  justCreatedSecret.value = null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-api-keys">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'API keys' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">API keys</h1>
      <p class="text-body text-text-secondary mt-1">
        Issue, view, and revoke programmatic credentials for this organization.
      </p>
    </header>

    <!-- Issue-once banner -->
    <BulwarkCard
      v-if="justCreatedSecret"
      padding="md"
      class="mt-4 border-status-warning bg-status-warning/5"
      data-testid="api-key-secret-banner"
    >
      <p class="text-body font-medium text-status-warning">
        Copy this key now — you will not see it again.
      </p>
      <p class="text-small text-text-secondary mt-1">
        {{ justCreatedSecret.label }}
      </p>
      <code
        class="block mt-2 break-all rounded-card bg-surface-muted p-2 text-small"
        data-testid="api-key-secret-value"
      >{{ justCreatedSecret.secret }}</code>
      <div class="mt-2 flex justify-end">
        <BulwarkButton
          type="button"
          variant="secondary"
          size="sm"
          data-testid="api-key-secret-dismiss"
          @click="dismissSecret"
        >
          I've saved it
        </BulwarkButton>
      </div>
    </BulwarkCard>

    <!-- Issue form -->
    <form class="mt-4 flex gap-2 items-end" @submit.prevent="onCreate">
      <BulwarkInput
        v-model="newLabel"
        label="Key label"
        placeholder="Production webhook"
        class="flex-1"
      />
      <BulwarkButton
        type="submit"
        variant="primary"
        :disabled="creating || !newLabel.trim()"
        data-testid="api-key-create-button"
      >
        {{ creating ? 'Issuing…' : 'Issue key' }}
      </BulwarkButton>
    </form>

    <!-- List -->
    <section class="mt-6" data-testid="api-key-list">
      <BulwarkCard v-if="rows.length === 0" padding="md">
        <p class="text-body text-text-secondary" data-testid="api-key-empty">
          No keys yet. Issue one above to get started.
        </p>
      </BulwarkCard>
      <BulwarkCard v-else padding="none">
        <ul class="divide-y divide-border-default">
          <li
            v-for="row in rows"
            :key="row.id"
            class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
            data-testid="api-key-row"
          >
            <div class="md:col-span-5">
              <p class="text-body font-medium text-text-primary">{{ row.label }}</p>
              <code class="text-small text-text-secondary">{{ row.prefix }}</code>
            </div>
            <div class="md:col-span-3 text-small text-text-secondary self-center">
              Issued {{ formatDate(row.createdAt) }}
            </div>
            <div class="md:col-span-2 self-center">
              <span
                v-if="row.revokedAt"
                class="inline-flex items-center rounded-pill bg-status-error/10 text-status-error px-2.5 py-1 text-tiny font-medium"
                data-testid="api-key-status"
                data-status="revoked"
              >Revoked</span>
              <span
                v-else
                class="inline-flex items-center rounded-pill bg-status-success/10 text-status-success px-2.5 py-1 text-tiny font-medium"
                data-testid="api-key-status"
                data-status="active"
              >Active</span>
            </div>
            <div class="md:col-span-2 self-center md:text-right">
              <button
                v-if="!row.revokedAt"
                type="button"
                class="text-small text-status-error hover:underline"
                data-testid="api-key-revoke-button"
                @click="onRevoke(row)"
              >
                Revoke
              </button>
            </div>
          </li>
        </ul>
      </BulwarkCard>
    </section>

    <p
      v-if="serverError"
      class="mt-3 text-small text-status-error"
      data-testid="api-key-error"
    >
      {{ serverError }}
    </p>
  </div>
</template>
