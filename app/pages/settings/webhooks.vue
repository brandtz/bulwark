<!--
  app/pages/settings/webhooks.vue — outbound webhook subscriptions
  (W2-4 / EH-H Part B / ADR-0022).

  # Decisions
    - Issue-once secret banner mirrors api-keys.vue.
    - Multi-select of event types pulls from KNOWN_EVENT_TYPES.
    - "Test" fires a synthetic ping and immediately reloads deliveries.
    - HMAC algo + header copy shown in the help link/text so admins
      can write a verifier.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  WEBHOOK_SIGNATURE_ALGORITHM,
  WEBHOOK_SIGNATURE_HEADER,
  type Webhook,
  type WebhookDelivery,
} from '~~/shared/contracts/webhook'
import { KNOWN_EVENT_TYPES } from '~~/shared/contracts/notification-subscription'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Webhooks' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const webhookService = useService('webhook')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const rows = ref<Webhook[]>([])
async function load() {
  const r = await webhookService.list(orgId.value)
  rows.value = r.rows
}
await load()

// Create modal.
const showCreate = ref(false)
const draft = ref({ name: '', url: '', eventTypes: [] as string[] })
const creating = ref(false)
const justCreatedSecret = ref<{ name: string; secret: string } | null>(null)

async function onCreate() {
  if (!draft.value.name.trim() || !draft.value.url.trim()) return
  creating.value = true
  try {
    const r = await webhookService.create({
      organizationId: orgId.value,
      name: draft.value.name.trim(),
      url: draft.value.url.trim(),
      eventTypes: draft.value.eventTypes,
    })
    justCreatedSecret.value = { name: r.row.name, secret: r.secret }
    showCreate.value = false
    draft.value = { name: '', url: '', eventTypes: [] }
    await load()
  } catch (err) {
    toastError('Could not create webhook', (err as Error).message)
  } finally {
    creating.value = false
  }
}

async function onDelete(row: Webhook) {
  if (!confirm(`Delete webhook "${row.name}"?`)) return
  await webhookService.softDelete(row.id, orgId.value)
  toastSuccess('Webhook deleted')
  await load()
}

async function onToggleActive(row: Webhook) {
  await webhookService.update({ id: row.id, organizationId: orgId.value, isActive: !row.isActive })
  toastSuccess(row.isActive ? 'Webhook paused' : 'Webhook activated')
  await load()
}

const deliveriesById = ref<Record<string, WebhookDelivery[]>>({})
const expanded = ref<string | null>(null)
async function onExpand(row: Webhook) {
  if (expanded.value === row.id) {
    expanded.value = null
    return
  }
  expanded.value = row.id
  const list = await webhookService.deliveries(row.id, orgId.value, 25)
  deliveriesById.value = { ...deliveriesById.value, [row.id]: list }
}

async function onTest(row: Webhook) {
  try {
    const delivery = await webhookService.test(row.id, orgId.value)
    toastSuccess('Test sent', `Status ${delivery.responseStatus ?? 'network error'}`)
    if (expanded.value === row.id) await onExpand(row) // refresh
  } catch (err) {
    toastError('Test failed', (err as Error).message)
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="settings-webhooks">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Webhooks' }]"
    />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Webhooks</h1>
        <p class="text-body text-text-secondary mt-1">
          POST org events to your services. Signed with
          <code>{{ WEBHOOK_SIGNATURE_HEADER }}: {{ WEBHOOK_SIGNATURE_ALGORITHM }}=&lt;hex&gt;</code>.
        </p>
      </div>
      <BulwarkButton variant="primary" data-testid="webhook-create-button" @click="showCreate = true">
        New webhook
      </BulwarkButton>
    </header>

    <BulwarkCard
      v-if="justCreatedSecret"
      padding="md"
      class="mt-4 border-status-warning bg-status-warning/5"
      data-testid="webhook-secret-banner"
    >
      <p class="text-body font-medium text-status-warning">
        Copy this signing secret now — you will not see it again.
      </p>
      <p class="text-small text-text-secondary mt-1">{{ justCreatedSecret.name }}</p>
      <code
        class="block mt-2 break-all rounded-card bg-surface-muted p-2 text-small"
        data-testid="webhook-secret-value"
      >{{ justCreatedSecret.secret }}</code>
      <div class="mt-2 flex justify-end">
        <BulwarkButton size="sm" variant="secondary" @click="justCreatedSecret = null">
          I've saved it
        </BulwarkButton>
      </div>
    </BulwarkCard>

    <BulwarkCard padding="none" class="mt-6">
      <p v-if="rows.length === 0" class="p-4 text-small text-text-secondary" data-testid="webhook-empty">
        No webhooks yet. Create one above.
      </p>
      <ul v-else class="divide-y divide-border-default">
        <li
          v-for="row in rows"
          :key="row.id"
          class="p-3 md:p-4"
          data-testid="webhook-row"
        >
          <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <div class="md:col-span-5">
              <p class="text-body font-medium">{{ row.name }}</p>
              <p class="text-small text-text-secondary break-all">{{ row.url }}</p>
              <p class="text-tiny text-text-secondary mt-1">
                Signs with <code>{{ row.secretPrefix }}…</code>
                <span v-if="row.failureCount >= 3" class="text-status-error ml-2" data-testid="webhook-failures">
                  ⚠ {{ row.failureCount }} failures
                </span>
              </p>
            </div>
            <div class="md:col-span-4 text-small text-text-secondary">
              <p>{{ row.eventTypes.length }} event{{ row.eventTypes.length === 1 ? '' : 's' }}</p>
              <p class="text-tiny">{{ row.eventTypes.slice(0, 3).join(', ') }}{{ row.eventTypes.length > 3 ? '…' : '' }}</p>
            </div>
            <div class="md:col-span-3 md:text-right text-small">
              <button type="button" class="text-status-info hover:underline mr-3" data-testid="webhook-test-button" @click="onTest(row)">Test</button>
              <button type="button" class="text-status-warning hover:underline mr-3" data-testid="webhook-toggle-button" @click="onToggleActive(row)">
                {{ row.isActive ? 'Pause' : 'Resume' }}
              </button>
              <button type="button" class="text-status-error hover:underline" data-testid="webhook-delete-button" @click="onDelete(row)">Delete</button>
            </div>
          </div>
          <div class="mt-2 text-tiny">
            <button type="button" class="text-text-secondary hover:underline" data-testid="webhook-deliveries-toggle" @click="onExpand(row)">
              {{ expanded === row.id ? 'Hide deliveries' : 'Show recent deliveries' }}
            </button>
          </div>
          <div v-if="expanded === row.id" class="mt-2 border border-border-default rounded-card" data-testid="webhook-deliveries">
            <ul class="divide-y divide-border-default">
              <li
                v-for="d in (deliveriesById[row.id] ?? [])"
                :key="d.id"
                class="p-2 grid grid-cols-12 gap-2 text-tiny"
                data-testid="webhook-delivery-row"
              >
                <span class="col-span-3">{{ new Date(d.createdAt).toLocaleString() }}</span>
                <span class="col-span-4">{{ d.eventType }}</span>
                <span class="col-span-2">attempt {{ d.attempt }}</span>
                <span class="col-span-3" :class="d.responseStatus && d.responseStatus < 400 ? 'text-status-success' : 'text-status-error'">
                  {{ d.responseStatus ?? 'network error' }}
                </span>
              </li>
              <li v-if="!(deliveriesById[row.id] ?? []).length" class="p-2 text-tiny text-text-secondary">
                No deliveries yet.
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </BulwarkCard>

    <!-- Create modal -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="webhook-create-modal"
    >
      <BulwarkCard padding="md" class="w-full max-w-lg">
        <h2 class="text-headline mb-3">New webhook</h2>
        <form class="space-y-3" @submit.prevent="onCreate">
          <BulwarkInput v-model="draft.name" label="Name" placeholder="Production listener" data-testid="webhook-name-input" />
          <BulwarkInput v-model="draft.url" label="URL" placeholder="https://example.com/hook" data-testid="webhook-url-input" />
          <div>
            <label class="block text-small font-medium text-text-secondary mb-1">Events</label>
            <div class="max-h-48 overflow-y-auto border border-border-default rounded-card p-2 space-y-1">
              <label
                v-for="e in KNOWN_EVENT_TYPES"
                :key="e.eventType"
                class="flex items-start gap-2 text-small"
                data-testid="webhook-event-option"
              >
                <input
                  type="checkbox"
                  :value="e.eventType"
                  v-model="draft.eventTypes"
                  class="mt-1"
                />
                <span>
                  <span class="font-medium">{{ e.label }}</span>
                  <span class="block text-tiny text-text-secondary">{{ e.eventType }}</span>
                </span>
              </label>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <BulwarkButton type="button" variant="secondary" @click="showCreate = false">Cancel</BulwarkButton>
            <BulwarkButton type="submit" variant="primary" :disabled="creating" data-testid="webhook-submit-button">
              {{ creating ? 'Creating…' : 'Create' }}
            </BulwarkButton>
          </div>
        </form>
      </BulwarkCard>
    </div>
  </div>
</template>
