<!--
  app/pages/settings/standards.vue — compliance standards editor (E9-S3).

  # Decisions (ADR-0008)
    - Editor is a vertical list of toggles per compliant value, plus
      a single switch for `requireDefensibleSpace`. Saving submits
      the full shape (full-replace contract).
    - Wired through `useService('standards')` so a future real impl
      drops in transparently.

  # Decision cast down
    - Rejected: a "reset to Oregon defaults" button. Surfacing the
      defaults inline as the initial form state (when the tenant has
      never customised) makes the reset implicit.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { OREGON_DEFAULT_STANDARDS } from '~~/shared/utils/compliance'
import type { ComplianceStandards } from '~~/shared/contracts/standards'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Compliance standards' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const standardsService = useService('standards')
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const ROOF_OPTIONS = [
  { value: 'metal', label: 'Metal' },
  { value: 'tile', label: 'Tile' },
  { value: 'class_a_asphalt', label: 'Class A asphalt' },
  { value: 'asphalt_shingle', label: 'Asphalt shingle' },
  { value: 'wood_shake', label: 'Wood shake (combustible)' },
] as const

const SIDING_OPTIONS = [
  { value: 'fiber_cement', label: 'Fiber cement' },
  { value: 'stucco', label: 'Stucco' },
  { value: 'metal', label: 'Metal' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'brick', label: 'Brick' },
  { value: 'wood', label: 'Wood (combustible)' },
  { value: 'vinyl', label: 'Vinyl' },
] as const

const EAVE_OPTIONS = [
  { value: 'enclosed', label: 'Enclosed' },
  { value: 'boxed', label: 'Boxed' },
  { value: 'open', label: 'Open' },
] as const

const VENT_OPTIONS = [
  { value: 'ember_resistant', label: 'Ember-resistant (1/16" mesh)' },
  { value: 'standard', label: 'Standard' },
] as const

const form = reactive<ComplianceStandards>({
  compliantRoofMaterials: [...OREGON_DEFAULT_STANDARDS.compliantRoofMaterials],
  compliantSidingMaterials: [...OREGON_DEFAULT_STANDARDS.compliantSidingMaterials],
  compliantEaveTypes: [...OREGON_DEFAULT_STANDARDS.compliantEaveTypes],
  compliantVentTypes: [...OREGON_DEFAULT_STANDARDS.compliantVentTypes],
  requireDefensibleSpace: OREGON_DEFAULT_STANDARDS.requireDefensibleSpace,
})

const loaded = ref(false)
async function load() {
  if (!orgId.value) return
  const row = await standardsService.get(orgId.value)
  Object.assign(form, row.standards)
  loaded.value = true
}
await load()

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const saving = ref(false)
const serverError = ref('')

async function onSave() {
  serverError.value = ''
  saving.value = true
  try {
    await standardsService.save(
      orgId.value,
      {
        compliantRoofMaterials: form.compliantRoofMaterials,
        compliantSidingMaterials: form.compliantSidingMaterials,
        compliantEaveTypes: form.compliantEaveTypes,
        compliantVentTypes: form.compliantVentTypes,
        requireDefensibleSpace: form.requireDefensibleSpace,
      },
      session.value?.userId ?? null,
    )
    toastSuccess('Standards saved', 'New compliance rules are active.')
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not save standards.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-standards">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Compliance standards' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Compliance standards</h1>
      <p class="text-body text-text-secondary mt-1">
        Override the Oregon WUI defaults that drive the assessment evaluator.
      </p>
    </header>

    <form class="mt-6 flex flex-col gap-6" @submit.prevent="onSave">
      <fieldset data-testid="standards-roof">
        <legend class="text-h2 mb-2">Compliant roof materials</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="opt in ROOF_OPTIONS"
            :key="opt.value"
            class="inline-flex items-center gap-2 rounded-pill border border-border-default px-3 py-1.5 text-small cursor-pointer"
            :class="form.compliantRoofMaterials.includes(opt.value) ? 'bg-status-success/10 border-status-success text-status-success' : ''"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="form.compliantRoofMaterials.includes(opt.value)"
              :data-testid="`standards-roof-${opt.value}`"
              @change="form.compliantRoofMaterials = toggle(form.compliantRoofMaterials, opt.value)"
            />
            {{ opt.label }}
          </label>
        </div>
      </fieldset>

      <fieldset data-testid="standards-siding">
        <legend class="text-h2 mb-2">Compliant siding materials</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="opt in SIDING_OPTIONS"
            :key="opt.value"
            class="inline-flex items-center gap-2 rounded-pill border border-border-default px-3 py-1.5 text-small cursor-pointer"
            :class="form.compliantSidingMaterials.includes(opt.value) ? 'bg-status-success/10 border-status-success text-status-success' : ''"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="form.compliantSidingMaterials.includes(opt.value)"
              :data-testid="`standards-siding-${opt.value}`"
              @change="form.compliantSidingMaterials = toggle(form.compliantSidingMaterials, opt.value)"
            />
            {{ opt.label }}
          </label>
        </div>
      </fieldset>

      <fieldset data-testid="standards-eaves">
        <legend class="text-h2 mb-2">Compliant eaves</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="opt in EAVE_OPTIONS"
            :key="opt.value"
            class="inline-flex items-center gap-2 rounded-pill border border-border-default px-3 py-1.5 text-small cursor-pointer"
            :class="form.compliantEaveTypes.includes(opt.value) ? 'bg-status-success/10 border-status-success text-status-success' : ''"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="form.compliantEaveTypes.includes(opt.value)"
              @change="form.compliantEaveTypes = toggle(form.compliantEaveTypes, opt.value)"
            />
            {{ opt.label }}
          </label>
        </div>
      </fieldset>

      <fieldset data-testid="standards-vents">
        <legend class="text-h2 mb-2">Compliant vents</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="opt in VENT_OPTIONS"
            :key="opt.value"
            class="inline-flex items-center gap-2 rounded-pill border border-border-default px-3 py-1.5 text-small cursor-pointer"
            :class="form.compliantVentTypes.includes(opt.value) ? 'bg-status-success/10 border-status-success text-status-success' : ''"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="form.compliantVentTypes.includes(opt.value)"
              @change="form.compliantVentTypes = toggle(form.compliantVentTypes, opt.value)"
            />
            {{ opt.label }}
          </label>
        </div>
      </fieldset>

      <fieldset data-testid="standards-defensible">
        <legend class="text-h2 mb-2">Defensible space</legend>
        <label class="inline-flex items-center gap-2">
          <input
            v-model="form.requireDefensibleSpace"
            type="checkbox"
            class="h-4 w-4"
            data-testid="standards-defensible-checkbox"
          />
          <span class="text-body">Require defensible space cleared</span>
        </label>
      </fieldset>

      <div class="flex justify-end gap-2">
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="saving"
          data-testid="standards-save-button"
        >
          {{ saving ? 'Saving…' : 'Save standards' }}
        </BulwarkButton>
      </div>

      <p
        v-if="serverError"
        class="text-small text-status-error"
        data-testid="standards-error"
      >
        {{ serverError }}
      </p>
    </form>
  </div>
</template>
