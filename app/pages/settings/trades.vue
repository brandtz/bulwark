<!--
  app/pages/settings/trades.vue — Trades catalog editor
  (Wave 1B / EH-H Part A / W1-3).

  # Decisions (ADR-0008)
    - Admin-only. Mirrors /settings/programs.vue (same modal CRUD
      pattern, same "builtin can't be deleted" guard, same toast +
      error surfaces).
    - Built-in trade slugs (roofing, siding, gutters, eaves_vents,
      defensible_space, general_labor) match the platform Zod enum
      `TradeSchema` — they're the universe of WO trade slots until
      Wave 2 widens that contract. Custom trade rows are stored but
      not yet consumable by WO scaffolding (flagged in the W1-3
      handoff for Wave 2 follow-up).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type { TradeRecord } from '~~/shared/contracts/trade'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Trades' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const svc = useService('trade')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const trades = ref<TradeRecord[]>([])
const loading = ref(false)
const serverError = ref('')

async function load() {
  if (!orgId.value) return
  loading.value = true
  try {
    const out = await svc.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
      includeInactive: true,
    })
    trades.value = out.rows
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not load trades.'
  } finally {
    loading.value = false
  }
}
await load()

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  slug: '',
  name: '',
  description: '',
  color: '#475569',
  sortOrder: 0,
  isActive: true,
})
const formError = ref('')
const saving = ref(false)

const editing = computed<TradeRecord | null>(() =>
  editingId.value ? trades.value.find((t) => t.id === editingId.value) ?? null : null,
)
const isEditing = computed(() => editingId.value !== null)
const isEditingBuiltin = computed(() => editing.value?.isBuiltin === true)

function resetForm() {
  form.slug = ''
  form.name = ''
  form.description = ''
  form.color = '#475569'
  form.sortOrder = trades.value.length * 10
  form.isActive = true
  formError.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  modalOpen.value = true
}

function openEdit(t: TradeRecord) {
  editingId.value = t.id
  form.slug = t.slug
  form.name = t.name
  form.description = t.description ?? ''
  form.color = t.color ?? '#475569'
  form.sortOrder = t.sortOrder
  form.isActive = t.isActive
  formError.value = ''
  modalOpen.value = true
}

function autoSlug() {
  if (isEditing.value || form.slug) return
  form.slug = form.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

async function onSave() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Name is required.'; return }
  if (!isEditing.value && !/^[a-z0-9_]+$/.test(form.slug)) {
    formError.value = 'Slug must be snake_case (a-z, 0-9, underscores).'
    return
  }
  saving.value = true
  try {
    if (isEditing.value && editing.value) {
      await svc.update({
        id: editing.value.id,
        organizationId: orgId.value,
        ...(isEditingBuiltin.value
          ? { isActive: form.isActive, sortOrder: form.sortOrder }
          : {
              name: form.name,
              description: form.description || null,
              color: form.color,
              sortOrder: form.sortOrder,
              isActive: form.isActive,
            }),
      })
      toastSuccess('Trade updated', form.name)
    } else {
      await svc.create({
        organizationId: orgId.value,
        slug: form.slug,
        name: form.name,
        description: form.description || null,
        color: form.color,
        sortOrder: form.sortOrder,
      })
      toastSuccess('Trade created', form.name)
    }
    modalOpen.value = false
    await load()
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function onDelete(t: TradeRecord) {
  if (t.isBuiltin) return
  if (typeof window !== 'undefined' && !window.confirm(`Delete trade "${t.name}"?`)) return
  try {
    await svc.softDelete(t.id, orgId.value)
    toastSuccess('Trade deleted', t.name)
    await load()
  } catch (err: unknown) {
    toastError('Delete failed', err instanceof Error ? err.message : 'Try again.')
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-trades">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Trades' }]"
    />
    <header class="mt-2 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-display">Trades</h1>
        <p class="text-body text-text-secondary mt-1">
          The catalog of trades your org assigns to work orders.
        </p>
      </div>
      <BulwarkButton
        data-testid="trades-new-button"
        variant="primary"
        @click="openCreate"
      >New trade</BulwarkButton>
    </header>

    <p v-if="serverError" class="mt-4 text-small text-status-error" role="alert">{{ serverError }}</p>

    <div v-if="loading" class="mt-6 text-body text-text-secondary">Loading…</div>

    <ul v-else class="mt-6 flex flex-col gap-3" data-testid="trades-list">
      <li
        v-for="t in trades"
        :key="t.id"
        data-testid="trade-row"
        :data-trade-slug="t.slug"
      >
        <BulwarkCard padding="md">
          <div class="flex items-start gap-3">
            <span
              class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0 border border-border"
              :style="{ backgroundColor: t.color ?? '#94a3b8' }"
              aria-hidden="true"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-body font-medium text-text-primary">{{ t.name }}</p>
                <span
                  v-if="t.isBuiltin"
                  data-testid="trade-builtin-badge"
                  class="inline-flex items-center rounded-pill bg-info-light text-info px-2 py-0.5 text-tiny font-medium"
                >Built-in</span>
                <span
v-else
                  class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-tiny font-medium"
                >Custom</span>
                <span
v-if="t.isActive"
                  class="inline-flex items-center rounded-pill bg-success-light text-success-dark px-2 py-0.5 text-tiny font-medium"
                >Active</span>
                <span
v-else
                  class="inline-flex items-center rounded-pill bg-blocked-light text-blocked px-2 py-0.5 text-tiny font-medium"
                >Inactive</span>
              </div>
              <p class="text-small text-text-secondary mt-0.5 font-mono">{{ t.slug }}</p>
              <p v-if="t.description" class="text-small text-text-secondary mt-2">{{ t.description }}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <BulwarkButton
                variant="ghost"
                size="sm"
                :data-testid="`trade-edit-${t.slug}`"
                @click="openEdit(t)"
              >Edit</BulwarkButton>
              <BulwarkButton
                v-if="!t.isBuiltin"
                variant="ghost"
                size="sm"
                :data-testid="`trade-delete-${t.slug}`"
                @click="onDelete(t)"
              >Delete</BulwarkButton>
            </div>
          </div>
        </BulwarkCard>
      </li>
    </ul>

    <BulwarkModal
      v-model="modalOpen"
      :title="isEditing ? 'Edit trade' : 'New trade'"
      size="md"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onSave">
        <BulwarkInput
          v-model="form.name"
          label="Name"
          required
          data-testid="trade-form-name"
          @blur="autoSlug"
        />
        <BulwarkInput
          v-if="!isEditing"
          v-model="form.slug"
          label="Slug"
          required
          hint="snake_case. Used to identify the trade in WO slots."
          data-testid="trade-form-slug"
        />
        <p v-else class="text-small text-text-secondary">
          Slug: <span class="font-mono">{{ editing?.slug }}</span>
        </p>
        <BulwarkTextarea
          v-model="form.description"
          label="Description (optional)"
          :rows="2"
        />
        <BulwarkInput v-model="form.color" label="Color (hex)" />
        <BulwarkInput
          :model-value="String(form.sortOrder)"
          label="Sort order"
          @update:model-value="(v: string) => (form.sortOrder = Number(v) || 0)"
        />
        <label class="inline-flex items-center gap-2 text-small">
          <input v-model="form.isActive" type="checkbox" > Active
        </label>
        <p v-if="formError" class="text-small text-status-error" role="alert">{{ formError }}</p>
        <footer class="flex items-center justify-end gap-2">
          <BulwarkButton variant="ghost" type="button" @click="modalOpen = false">Cancel</BulwarkButton>
          <BulwarkButton
            variant="primary"
            type="submit"
            :disabled="saving"
            data-testid="trade-form-save"
          >{{ saving ? 'Saving…' : 'Save' }}</BulwarkButton>
        </footer>
      </form>
    </BulwarkModal>
  </div>
</template>
