<!--
  app/pages/settings/pipelines.vue — Status pipelines editor
  (Wave 1B / EH-H Part A / W1-3 / ADR-0023).

  # Decisions (ADR-0008, ADR-0023)
    - Admin-only via ROLE_GROUPS.admin role middleware.
    - One editable pipeline per (org, entityType). The "Entity"
      select on the toolbar switches which pipeline is loaded. The
      status engine (W1-4) reads `getActive(entityType)` so this UI
      is the authoritative editor for runtime behaviour.
    - Save is full-replace: the form's node list becomes the new
      version (vN+1). Prior versions are retained read-only by the
      service. The UI surfaces only the active version.
    - Add/remove/reorder are local mutations until Save. "Reset to
      default" pulls from DEFAULT_PIPELINES (currently displayed
      version is dropped if admin saves — they always Save explicitly).
    - "Allowed transitions" is a multi-select that lists the OTHER
      nodes (you can't transition to yourself implicitly — same-slug
      is always allowed by canTransition).

  # Decision cast down
    - Rejected: drag-to-reorder. Up/down buttons keep the editor
      keyboard-accessible without dragging a new dep.
    - Rejected: per-row tx (autosave on blur). Pipelines are a
      coherent shape; a partial save with one new node but stale
      transitions on its neighbours is a graph mess.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { DEFAULT_PIPELINES } from '~~/shared/pipelines/defaults'
import {
  STATUS_PIPELINE_ENTITY_LABEL,
  type StatusPipelineEntityType,
  type StatusPipelineFull,
  type StatusPipelineNodeInput,
} from '~~/shared/contracts/status-pipeline'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Status pipelines' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const svc = useService('statusPipeline')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const ENTITY_OPTIONS = (Object.keys(STATUS_PIPELINE_ENTITY_LABEL) as StatusPipelineEntityType[])
  .map((v) => ({ value: v, label: STATUS_PIPELINE_ENTITY_LABEL[v] }))

const activeEntity = ref<StatusPipelineEntityType>('property')
const pipeline = ref<StatusPipelineFull | null>(null)
const draft = ref<StatusPipelineNodeInput[]>([])
const loading = ref(false)
const saving = ref(false)
const serverError = ref('')

function fullToDraft(p: StatusPipelineFull): StatusPipelineNodeInput[] {
  return p.nodes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((n) => ({
      slug: n.slug,
      labelKey: n.labelKey,
      color: n.color,
      description: n.description,
      sortOrder: n.sortOrder,
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
      allowedTransitions: [...n.allowedTransitions],
    }))
}

async function load() {
  if (!orgId.value) return
  loading.value = true
  serverError.value = ''
  try {
    const active = await svc.bootstrap({
      organizationId: orgId.value,
      entityType: activeEntity.value,
    })
    pipeline.value = active
    draft.value = fullToDraft(active)
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not load pipeline.'
  } finally {
    loading.value = false
  }
}
await load()
watch(activeEntity, () => { load() })

function addNode() {
  draft.value.push({
    slug: `status_${draft.value.length + 1}`,
    labelKey: `status.${activeEntity.value}.status_${draft.value.length + 1}`,
    color: '#94A3B8',
    description: null,
    sortOrder: (draft.value[draft.value.length - 1]?.sortOrder ?? 0) + 10,
    isInitial: false,
    isTerminal: false,
    allowedTransitions: [],
  })
}

function removeNode(idx: number) {
  const removed = draft.value[idx]
  draft.value.splice(idx, 1)
  // Strip the removed slug from every other node's allowed list.
  if (removed) {
    for (const n of draft.value) {
      n.allowedTransitions = n.allowedTransitions.filter((s) => s !== removed.slug)
    }
  }
}

function move(idx: number, delta: number) {
  const next = idx + delta
  if (next < 0 || next >= draft.value.length) return
  const tmp = draft.value[idx]!
  draft.value[idx] = draft.value[next]!
  draft.value[next] = tmp
  // Re-stamp sortOrder.
  draft.value.forEach((n, i) => { n.sortOrder = (i + 1) * 10 })
}

function setInitial(idx: number) {
  draft.value.forEach((n, i) => { n.isInitial = i === idx })
}

function resetToDefaults() {
  if (typeof window !== 'undefined' && !window.confirm('Discard local edits and reload defaults for this entity?')) return
  const defaults = DEFAULT_PIPELINES[activeEntity.value]
  draft.value = defaults.nodes.map((n) => ({
    slug: n.slug,
    labelKey: n.labelKey,
    color: n.color,
    description: n.description ?? null,
    sortOrder: n.sortOrder,
    isInitial: n.isInitial,
    isTerminal: n.isTerminal,
    allowedTransitions: [...n.allowedTransitions],
  }))
}

function otherSlugOptions(currentSlug: string) {
  return draft.value
    .filter((n) => n.slug !== currentSlug)
    .map((n) => ({ value: n.slug, label: n.slug }))
}

async function onSave() {
  serverError.value = ''
  saving.value = true
  try {
    const saved = await svc.save({
      organizationId: orgId.value,
      entityType: activeEntity.value,
      nodes: draft.value,
    })
    pipeline.value = saved
    draft.value = fullToDraft(saved)
    toastSuccess('Pipeline saved', `${STATUS_PIPELINE_ENTITY_LABEL[activeEntity.value]} v${saved.version}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Save failed.'
    serverError.value = msg
    toastError('Save failed', msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-pipelines">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Status pipelines' }]"
    />
    <header class="mt-2 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-display">Status pipelines</h1>
        <p class="text-body text-text-secondary mt-1">
          Define the status slugs, colours, and allowed transitions for every
          entity in your org. Saving creates a new version and activates it.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <BulwarkSelect
          v-model="activeEntity"
          label="Entity"
          :options="ENTITY_OPTIONS"
          data-testid="pipeline-entity-select"
        />
      </div>
    </header>

    <p v-if="serverError" class="mt-4 text-small text-status-error" role="alert">
      {{ serverError }}
    </p>

    <div v-if="loading" class="mt-6 text-body text-text-secondary">Loading…</div>

    <section v-else class="mt-6 flex flex-col gap-3" data-testid="pipeline-nodes">
      <BulwarkCard
        v-for="(n, idx) in draft"
        :key="`${n.slug}-${idx}`"
        padding="md"
        data-testid="pipeline-node-row"
        :data-node-slug="n.slug"
      >
        <div class="flex items-start gap-3">
          <span
            class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0 border border-border"
            :style="{ backgroundColor: n.color }"
            aria-hidden="true"
          />
          <div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3">
            <BulwarkInput
              v-model="n.slug"
              label="Slug"
              data-testid="pipeline-node-slug"
            />
            <BulwarkInput
              v-model="n.labelKey"
              label="Label key"
              hint="Use the Labels editor to set the display copy."
            />
            <BulwarkInput
              v-model="n.color"
              label="Color (hex)"
            />
            <BulwarkInput
              :model-value="String(n.sortOrder)"
              label="Sort order"
              @update:model-value="(v: string) => (n.sortOrder = Number(v) || 0)"
            />
            <div class="flex items-center gap-4">
              <label class="inline-flex items-center gap-2 text-small">
                <input
                  type="radio"
                  :name="`pipeline-initial-${activeEntity}`"
                  :checked="n.isInitial"
                  data-testid="pipeline-node-initial"
                  @change="setInitial(idx)"
                >
                Initial
              </label>
              <label class="inline-flex items-center gap-2 text-small">
                <input
                  v-model="n.isTerminal"
                  type="checkbox"
                  data-testid="pipeline-node-terminal"
                >
                Terminal
              </label>
            </div>
            <BulwarkMultiSelect
              v-model="n.allowedTransitions"
              label="Allowed transitions"
              :options="otherSlugOptions(n.slug)"
              data-testid="pipeline-node-transitions"
            />
          </div>
          <div class="flex flex-col gap-1 flex-shrink-0">
            <BulwarkButton variant="ghost" size="sm" @click="move(idx, -1)">↑</BulwarkButton>
            <BulwarkButton variant="ghost" size="sm" @click="move(idx, 1)">↓</BulwarkButton>
            <BulwarkButton
              variant="ghost"
              size="sm"
              data-testid="pipeline-node-remove"
              @click="removeNode(idx)"
            >Remove</BulwarkButton>
          </div>
        </div>
      </BulwarkCard>
    </section>

    <footer class="mt-6 flex flex-wrap items-center gap-3">
      <BulwarkButton variant="ghost" data-testid="pipeline-add-node" @click="addNode">
        Add status
      </BulwarkButton>
      <BulwarkButton variant="ghost" data-testid="pipeline-reset" @click="resetToDefaults">
        Reset to defaults
      </BulwarkButton>
      <span class="flex-1" />
      <span class="text-small text-text-secondary">
        Current version: <strong>v{{ pipeline?.version ?? '—' }}</strong>
      </span>
      <BulwarkButton
        variant="primary"
        data-testid="pipeline-save"
        :disabled="saving"
        @click="onSave"
      >{{ saving ? 'Saving…' : 'Save pipeline' }}</BulwarkButton>
    </footer>
  </div>
</template>
