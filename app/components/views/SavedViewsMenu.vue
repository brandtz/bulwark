<!--
  app/components/views/SavedViewsMenu.vue — Saved-views dropdown for
  admin list pages (W4-1 / EH-P / ADR-0033).

  # Decisions (ADR-0008, ADR-0033)
    - Single component reused across properties / quotes / WOs /
      invoices — only the `entityType` and the filter shape differ.
    - Visibility split inside the menu: user's own views (top), then
      shared org views, then management actions. Uses badges so the
      reader can tell which is which without expanding.
    - "Save current view" opens a modal (`BulwarkModal`) with a name,
      a "default" toggle, and a "share" toggle. Submits via
      `savedView.create({ userId: shared ? null : session.userId })`.
    - The component does NOT own filter state — it emits `apply` and
      lets each page decide how to translate the saved shape into
      route query / local state.

  # Decision cast down
    - A separate "shared-views" sub-menu. Rejected — flat list with
      a `Shared` badge is faster to scan and matches Linear-style UX.
-->
<script setup lang="ts">
import type { SavedView, SavedViewEntityType } from '~~/shared/contracts/saved-view'
import { partitionSavedViews } from '~/components/views/saved-views-helpers'

interface Props {
  entityType: SavedViewEntityType
  currentFilters: Record<string, unknown>
  currentSort?: { sortBy: string | null; sortDir: 'asc' | 'desc' | null }
}
const props = defineProps<Props>()

const emit = defineEmits<{
  apply: [view: { filters: Record<string, unknown>; sortBy: string | null; sortDir: 'asc' | 'desc' | null }]
}>()

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const savedView = useService('savedView')
const { t } = useLabel()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const open = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const views = ref<SavedView[]>([])
const loading = ref(false)

async function refreshList() {
  if (!orgId.value || !userId.value) return
  loading.value = true
  try {
    views.value = await savedView.list({
      organizationId: orgId.value,
      userId: userId.value,
      entityType: props.entityType,
    })
  } catch {
    views.value = []
  } finally {
    loading.value = false
  }
}

const partitioned = computed(() => partitionSavedViews(views.value, userId.value))

function toggle() {
  open.value = !open.value
  if (open.value) void refreshList()
}
function close() { open.value = false }

function applyView(v: SavedView) {
  emit('apply', { filters: v.filters, sortBy: v.sortBy, sortDir: v.sortDir })
  close()
}

function applyDefault() {
  emit('apply', { filters: {}, sortBy: null, sortDir: null })
  close()
}

function onDocMousedown(ev: MouseEvent) {
  const target = ev.target
  if (!wrapperRef.value || !(target instanceof Node)) return
  if (!wrapperRef.value.contains(target)) close()
}
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') close()
}
watch(open, (isOpen) => {
  if (typeof document === 'undefined') return
  if (isOpen) {
    document.addEventListener('mousedown', onDocMousedown)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    document.removeEventListener('keydown', onKey)
  }
})

// --- Save modal -----------------------------------------------------------
const showSaveModal = ref(false)
const saveName = ref('')
const saveAsDefault = ref(false)
const saveAsShared = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)

function openSave() {
  saveName.value = ''
  saveAsDefault.value = false
  saveAsShared.value = false
  saveError.value = null
  showSaveModal.value = true
  close()
}

async function submitSave() {
  if (!saveName.value.trim()) {
    saveError.value = 'Name is required'
    return
  }
  saving.value = true
  saveError.value = null
  try {
    await savedView.create({
      organizationId: orgId.value,
      userId: saveAsShared.value ? null : userId.value,
      entityType: props.entityType,
      name: saveName.value.trim(),
      filters: props.currentFilters,
      sortBy: props.currentSort?.sortBy ?? null,
      sortDir: props.currentSort?.sortDir ?? null,
      isDefault: saveAsDefault.value,
    })
    showSaveModal.value = false
    await refreshList()
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not save view'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div ref="wrapperRef" class="relative inline-block">
    <button
      type="button"
      class="inline-flex items-center gap-1 h-input px-3 rounded-input border border-border bg-surface text-body text-text-primary hover:border-primary"
      data-testid="saved-views-trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <span>{{ t('saved-views', 'title', 'Views') }}</span>
      <BulwarkIcon name="chevron-down" size="sm" class="text-text-secondary" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 mt-2 w-72 bg-surface border border-border rounded-card shadow-lg p-1 z-30"
      data-testid="saved-views-panel"
    >
      <button
        type="button"
        class="w-full text-left px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="saved-view-default"
        @click="applyDefault"
      >Default</button>

      <div v-if="partitioned.mine.length" class="my-1 border-t border-border" />
      <button
        v-for="v in partitioned.mine"
        :key="v.id"
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="saved-view-row"
        :data-view-id="v.id"
        @click="applyView(v)"
      >
        <span class="truncate">{{ v.name }}</span>
        <span
          v-if="v.isDefault"
          class="inline-flex items-center rounded-pill bg-primary text-white px-2 py-0.5 text-tiny"
        >{{ t('saved-views', 'default-badge', 'Default') }}</span>
      </button>

      <div v-if="partitioned.shared.length" class="my-1 border-t border-border" />
      <button
        v-for="v in partitioned.shared"
        :key="v.id"
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="saved-view-row"
        :data-view-id="v.id"
        :data-shared="'true'"
        @click="applyView(v)"
      >
        <span class="truncate">{{ v.name }}</span>
        <span class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-tiny">
          {{ t('saved-views', 'shared-badge', 'Shared') }}
        </span>
      </button>

      <div class="my-1 border-t border-border" />
      <button
        type="button"
        class="w-full text-left px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="saved-view-save"
        @click="openSave"
      >{{ t('saved-views', 'save', 'Save current view…') }}</button>
      <NuxtLink
        to="/settings/saved-views"
        class="block w-full text-left px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="saved-view-manage"
        @click="close"
      >{{ t('saved-views', 'manage', 'Manage views…') }}</NuxtLink>
    </div>

    <BulwarkModal v-model="showSaveModal" title="Save view">
      <form class="flex flex-col gap-3" @submit.prevent="submitSave">
        <BulwarkInput
          v-model="saveName"
          label="Name"
          placeholder="e.g. My open quotes"
          required
          data-testid="saved-view-name-input"
        />
        <label class="inline-flex items-center gap-2 text-small">
          <input
            v-model="saveAsDefault"
            type="checkbox"
            class="rounded border-border"
            data-testid="saved-view-default-toggle"
          />
          Make default
        </label>
        <label class="inline-flex items-center gap-2 text-small">
          <input
            v-model="saveAsShared"
            type="checkbox"
            class="rounded border-border"
            data-testid="saved-view-shared-toggle"
          />
          Share with org
        </label>
        <p v-if="saveError" class="text-small text-status-error">{{ saveError }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="inline-flex h-input items-center rounded-input border border-border px-4 text-body"
            @click="showSaveModal = false"
          >Cancel</button>
          <button
            type="submit"
            class="inline-flex h-input items-center rounded-input bg-primary text-white px-4 text-body font-medium"
            :disabled="saving"
            data-testid="saved-view-submit"
          >{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </BulwarkModal>
  </div>
</template>
