<!--
  app/pages/settings/programs.vue — GC Programs admin (Wave 1A / EH-A).

  # Decisions (ADR-0008, ADR-0013)
    - Programs are the canonical taxonomy under the GC-generalization
      mandate (D-H4). Every org sees its own list with the seeded
      Wildfire Retrofit at the top (sortOrder 0, builtin badge).
    - Built-in programs (currently just Wildfire Retrofit) cannot be
      hard-deleted (service-level guard) and cannot have their slug or
      kind changed (contract-level guard via ProgramUpdateInputSchema
      which omits those fields). They CAN be deactivated or reordered.
    - Custom programs are full-edit: rename, recolor, re-icon,
      deactivate, soft-delete.
    - Modal flow is identical to /admin/subcontractors/[id] — single
      BulwarkModal hosting either a Create or Edit form switched by
      `editingId.value`.

  # Decision cast down
    - Rejected: inline-editable cells. Custom programs deserve a real
      form (description is multi-line; default trade slots and pricing
      defaults are JSON blobs). A modal keeps the list scannable.
    - Rejected: surfacing the W2-2 template + standard FKs in this UI.
      They're nullable today and W2-2 owns the editor for those.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  PROGRAM_KIND_LABEL,
  type Program,
  type ProgramKind,
} from '~~/shared/contracts/program'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Programs' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const programService = useService('program')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const programs = ref<Program[]>([])
const loading = ref(false)
const serverError = ref('')

async function loadPrograms() {
  if (!orgId.value) return
  loading.value = true
  try {
    const out = await programService.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 100,
      includeInactive: true,
    })
    programs.value = out.rows
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not load programs.'
  } finally {
    loading.value = false
  }
}
await loadPrograms()

// ---------------------------------------------------------------------------
// Modal state
// ---------------------------------------------------------------------------
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  slug: '',
  name: '',
  kind: 'inspection_program' as ProgramKind,
  description: '',
  color: '#FF6B35',
  icon: '',
  isActive: true,
  sortOrder: 0,
})
const formError = ref('')
const saving = ref(false)

const editing = computed<Program | null>(() =>
  editingId.value ? programs.value.find((p) => p.id === editingId.value) ?? null : null,
)

const isEditingBuiltin = computed(() => editing.value?.isBuiltin === true)
const isEditing = computed(() => editingId.value !== null)

function resetForm() {
  form.slug = ''
  form.name = ''
  form.kind = 'inspection_program'
  form.description = ''
  form.color = '#FF6B35'
  form.icon = ''
  form.isActive = true
  form.sortOrder = programs.value.length
  formError.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  modalOpen.value = true
}

function openEdit(p: Program) {
  editingId.value = p.id
  form.slug = p.slug
  form.name = p.name
  form.kind = p.kind
  form.description = p.description ?? ''
  form.color = p.color ?? '#FF6B35'
  form.icon = p.icon ?? ''
  form.isActive = p.isActive
  form.sortOrder = p.sortOrder
  formError.value = ''
  modalOpen.value = true
}

function autoSlug() {
  if (editingId.value) return
  // Auto-derive slug from name on first keystroke after the slug is empty.
  if (!form.slug) {
    form.slug = form.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
  }
}

async function onSave() {
  formError.value = ''
  if (!form.name.trim()) {
    formError.value = 'Name is required.'
    return
  }
  if (!isEditing.value && !/^[a-z0-9-]+$/.test(form.slug)) {
    formError.value = 'Slug must be kebab-case (a-z, 0-9, hyphens).'
    return
  }
  saving.value = true
  try {
    if (isEditing.value && editing.value) {
      await programService.update({
        id: editing.value.id,
        organizationId: orgId.value,
        // Built-in: only isActive + sortOrder are editable per ADR-0013.
        ...(isEditingBuiltin.value
          ? {
              isActive: form.isActive,
              sortOrder: form.sortOrder,
            }
          : {
              name: form.name,
              description: form.description || null,
              color: form.color,
              icon: form.icon || null,
              isActive: form.isActive,
              sortOrder: form.sortOrder,
            }),
      })
      toastSuccess('Program updated', form.name)
    } else {
      await programService.create({
        organizationId: orgId.value,
        slug: form.slug,
        name: form.name,
        kind: form.kind,
        description: form.description || null,
        color: form.color,
        icon: form.icon || null,
        sortOrder: form.sortOrder,
      })
      toastSuccess('Program created', form.name)
    }
    modalOpen.value = false
    await loadPrograms()
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : 'Save failed.'
  } finally {
    saving.value = false
  }
}

async function onDelete(p: Program) {
  if (p.isBuiltin) return
  if (typeof window !== 'undefined' && !window.confirm(`Delete program "${p.name}"?`)) return
  try {
    await programService.softDelete(p.id, orgId.value)
    toastSuccess('Program deleted', p.name)
    await loadPrograms()
  } catch (err: unknown) {
    toastError('Delete failed', err instanceof Error ? err.message : 'Try again.')
  }
}

const KIND_OPTIONS = [
  { value: 'inspection_program', label: PROGRAM_KIND_LABEL.inspection_program },
  { value: 'service_program', label: PROGRAM_KIND_LABEL.service_program },
]
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-programs">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Programs' }]"
    />
    <header class="mt-2 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-display">Programs</h1>
        <p class="text-body text-text-secondary mt-1">
          Inspection &amp; service programs your org runs. Bulwark ships with
          Wildfire Retrofit; add as many custom programs as you need.
        </p>
      </div>
      <BulwarkButton
        data-testid="programs-new-button"
        variant="primary"
        @click="openCreate"
      >
        New program
      </BulwarkButton>
    </header>

    <p v-if="serverError" class="mt-4 text-small text-status-error" role="alert">
      {{ serverError }}
    </p>

    <div v-if="loading" class="mt-6 text-body text-text-secondary">Loading…</div>

    <EmptyState
      v-else-if="!programs.length"
      class="mt-6"
      title="No programs yet"
      body="Add an inspection or service program to start scaffolding inspections and quotes."
      icon="◇"
    />

    <ul v-else class="mt-6 flex flex-col gap-3" data-testid="programs-list">
      <li
        v-for="p in programs"
        :key="p.id"
        data-testid="program-row"
        :data-program-slug="p.slug"
      >
        <BulwarkCard padding="md">
          <div class="flex items-start gap-3">
            <span
              class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0 border border-border"
              :style="{ backgroundColor: p.color ?? '#94a3b8' }"
              aria-hidden="true"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-body font-medium text-text-primary">{{ p.name }}</p>
                <span
                  v-if="p.isBuiltin"
                  data-testid="program-builtin-badge"
                  class="inline-flex items-center rounded-pill bg-info-light text-info px-2 py-0.5 text-tiny font-medium"
                >Built-in</span>
                <span
                  v-else
                  class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-tiny font-medium"
                >Custom</span>
                <span
                  v-if="p.isActive"
                  data-testid="program-active-badge"
                  class="inline-flex items-center rounded-pill bg-success-light text-success-dark px-2 py-0.5 text-tiny font-medium"
                >Active</span>
                <span
                  v-else
                  data-testid="program-inactive-badge"
                  class="inline-flex items-center rounded-pill bg-blocked-light text-blocked px-2 py-0.5 text-tiny font-medium"
                >Inactive</span>
              </div>
              <p class="text-small text-text-secondary mt-0.5">
                <span class="font-mono">{{ p.slug }}</span>
                <span class="mx-1.5">·</span>
                <span>{{ PROGRAM_KIND_LABEL[p.kind] }}</span>
              </p>
              <p
                v-if="p.description"
                class="text-small text-text-secondary mt-2 line-clamp-2"
              >{{ p.description }}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <BulwarkButton
                variant="ghost"
                size="sm"
                :data-testid="`program-edit-${p.slug}`"
                @click="openEdit(p)"
              >Edit</BulwarkButton>
              <BulwarkButton
                v-if="!p.isBuiltin"
                variant="ghost"
                size="sm"
                :data-testid="`program-delete-${p.slug}`"
                @click="onDelete(p)"
              >Delete</BulwarkButton>
            </div>
          </div>
        </BulwarkCard>
      </li>
    </ul>

    <BulwarkModal
      v-model="modalOpen"
      :title="isEditing ? 'Edit program' : 'New program'"
      size="md"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onSave">
        <BulwarkInput
          v-model="form.name"
          label="Name"
          required
          data-testid="program-form-name"
          @blur="autoSlug"
        />
        <BulwarkInput
          v-if="!isEditing"
          v-model="form.slug"
          label="Slug"
          required
          hint="Kebab-case. Used in URLs and program lookups. Cannot be changed later."
          data-testid="program-form-slug"
        />
        <p
          v-else
          class="text-small text-text-secondary"
        >Slug: <span class="font-mono">{{ editing?.slug }}</span></p>

        <BulwarkSelect
          v-if="!isEditing"
          v-model="form.kind"
          label="Kind"
          :options="KIND_OPTIONS"
          required
          hint="Inspection programs emit a compliance doc; service programs do not."
          data-testid="program-form-kind"
        />

        <BulwarkTextarea
          v-if="!isEditingBuiltin"
          v-model="form.description"
          label="Description"
          :rows="3"
          data-testid="program-form-description"
        />

        <div v-if="!isEditingBuiltin" class="flex gap-3">
          <div class="flex-1">
            <label class="text-small font-medium text-text-primary" for="program-color">Color</label>
            <input
              id="program-color"
              v-model="form.color"
              type="color"
              data-testid="program-form-color"
              class="mt-1 h-input w-full rounded-input border border-border bg-surface px-2"
            >
          </div>
          <BulwarkInput
            v-model="form.icon"
            label="Icon"
            placeholder="lucide name"
            class="flex-1"
            data-testid="program-form-icon"
          />
        </div>

        <BulwarkToggle
          v-model="form.isActive"
          label="Active"
          data-testid="program-form-active"
        />

        <BulwarkInput
          v-model.number="form.sortOrder"
          type="number"
          label="Sort order"
          data-testid="program-form-sort"
        />

        <p
          v-if="formError"
          data-testid="program-form-error"
          class="text-small text-status-error"
          role="alert"
        >{{ formError }}</p>

        <div class="flex justify-end gap-2 mt-2">
          <BulwarkButton variant="ghost" type="button" @click="modalOpen = false">Cancel</BulwarkButton>
          <BulwarkButton
            variant="primary"
            type="submit"
            :loading="saving"
            data-testid="program-form-save"
          >{{ isEditing ? 'Save changes' : 'Create program' }}</BulwarkButton>
        </div>
      </form>
    </BulwarkModal>
  </div>
</template>
