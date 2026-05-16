<!--
  app/pages/settings/providers.vue — provider configuration
  (W2-4 / EH-H Part B / ADR-0021).

  # Decisions
    - One section per kind (email, sms, storage, pdf). Each section
      shows the active provider config + an "Edit" button that opens
      a modal with per-provider fields validated by the per-provider
      Zod on submit (service-side).
    - Secrets stored as-is for Phase 1 (sec-debt in handoff). KMS
      integration is W3-1.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  PROVIDERS_BY_KIND,
  type Provider,
  type ProviderConfig,
  type ProviderKind,
} from '~~/shared/contracts/provider-config'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Providers' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const providerConfig = useService('providerConfig')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const rows = ref<ProviderConfig[]>([])
async function load() {
  const r = await providerConfig.list(orgId.value)
  rows.value = r.rows
}
await load()

const KINDS: ProviderKind[] = ['email', 'sms', 'storage', 'pdf']

function activeFor(kind: ProviderKind): ProviderConfig | undefined {
  return rows.value.find((r) => r.kind === kind && r.isActive)
}

// Edit modal state.
const editing = ref<{ kind: ProviderKind; provider: Provider; config: Record<string, string> } | null>(null)

function openEdit(kind: ProviderKind) {
  const provider = PROVIDERS_BY_KIND[kind][0]!
  const active = activeFor(kind)
  editing.value = {
    kind,
    provider,
    config: { ...((active?.config as Record<string, string>) ?? {}) },
  }
}

const PROVIDER_FIELDS: Record<Provider, string[]> = {
  resend: ['apiKey', 'fromAddress'],
  twilio: ['accountSid', 'authToken', 'from'],
  r2: ['bucket', 'endpoint', 'accessKey', 'secretKey'],
  puppeteer: [],
}

const saving = ref(false)
async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    await providerConfig.upsert({
      organizationId: orgId.value,
      kind: editing.value.kind,
      provider: editing.value.provider,
      config: editing.value.config,
    })
    toastSuccess('Provider saved', `${editing.value.kind} now uses ${editing.value.provider}.`)
    editing.value = null
    await load()
  } catch (err) {
    toastError('Could not save provider', (err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="settings-providers">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Providers' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Providers</h1>
      <p class="text-body text-text-secondary mt-1">
        Configure how Bulwark sends email, SMS, stores files, and renders PDFs.
      </p>
    </header>

    <section class="mt-6 grid grid-cols-1 gap-3">
      <BulwarkCard
        v-for="kind in KINDS"
        :key="kind"
        padding="md"
        data-testid="provider-section"
        :data-kind="kind"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-body font-medium capitalize">{{ kind }}</p>
            <p class="text-small text-text-secondary mt-1">
              Active provider:
              <span data-testid="provider-active-name">
                {{ activeFor(kind)?.provider ?? 'Not configured' }}
              </span>
            </p>
          </div>
          <BulwarkButton variant="secondary" size="sm" data-testid="provider-configure-button" @click="openEdit(kind)">
            Configure
          </BulwarkButton>
        </div>
      </BulwarkCard>
    </section>

    <div
      v-if="editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="provider-modal"
    >
      <BulwarkCard padding="md" class="w-full max-w-md">
        <h2 class="text-headline mb-2 capitalize">{{ editing.kind }} · {{ editing.provider }}</h2>
        <form class="space-y-3" @submit.prevent="saveEdit">
          <div v-for="field in PROVIDER_FIELDS[editing.provider]" :key="field">
            <label class="block text-small font-medium text-text-secondary mb-1">{{ field }}</label>
            <input
              v-model="editing.config[field]"
              :type="field.toLowerCase().includes('key') || field === 'authToken' ? 'password' : 'text'"
              class="w-full rounded-input border border-border-default bg-surface-base px-3 py-2"
              :data-testid="`provider-field-${field}`"
            >
          </div>
          <p
            v-if="PROVIDER_FIELDS[editing.provider].length === 0"
            class="text-small text-text-secondary"
          >No configuration required.</p>
          <div class="flex justify-end gap-2 pt-2">
            <BulwarkButton type="button" variant="secondary" @click="editing = null">Cancel</BulwarkButton>
            <BulwarkButton type="submit" variant="primary" :disabled="saving" data-testid="provider-save-button">
              {{ saving ? 'Saving…' : 'Save' }}
            </BulwarkButton>
          </div>
        </form>
      </BulwarkCard>
    </div>
  </div>
</template>
