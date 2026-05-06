<!--
  app/pages/admin/properties/[id]/assessment.vue — assessment form (E4-S2).

  # Decisions (ADR-0008)
    - Mobile-first single-column layout. The GC fills this from the
      truck on a phone — every input is full-width, the submit CTA
      anchors at the bottom of the form, and nothing relies on hover.
      Wider viewports get a subtle max-width cap; we don't try to use
      the extra screen real estate because the layout would diverge
      from the field-tool feel.
    - Validation runs through `AssessmentCreateInputSchema.omit({
      organizationId, propertyId, assessedById, assessedAt })`. Same
      pattern as the property intake form: keep injected fields out of
      UI validation since the fixture orgIds aren't RFC-4122. The
      service contract still validates the full payload server-side.
    - Material pickers use BulwarkSelect (not BulwarkSegmentedControl)
      because each enum has 4\u20138 options \u2014 a segmented row would wrap
      ugly on mobile and a Select handles it cleanly. Defensible space
      is the only true boolean and uses BulwarkToggle.
    - On success we navigate to the freshly-rendered summary page (E4-S3).
      We use `router.push` (client navigation) instead of a full goto so the
      mock service's in-memory store \u2014 mutated client-side by `create()`
      \u2014 is the same module instance the summary fetch reads. Triggering
      a full SSR navigation here would hit a different process module
      with empty rows.
    - We default `assessedAt` to "now" and `assessedById` to the current
      session user. Both are server-trustworthy for mocks; the real
      implementation (E11) re-derives them server-side.

  # Decision cast down
    - Rejected: a multi-page wizard. The form is short enough to fit on
      one screen with scroll on mobile; a wizard adds friction for no
      win.
    - Rejected: per-field "?" tooltips explaining each material. Field
      crews already know which is which. We can layer hints later without
      touching the data path.
    - Rejected: client-side compliance preview before submit. The point
      of the summary page (E4-S3) is to be the single canonical answer.
      Showing a "you'll fail" warning here risks confusing pass/fail
      semantics if the standards change between submit and summary.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  AssessmentCreateInputSchema,
  type AssessmentCreateInput,
  type RoofMaterial,
  type SidingMaterial,
  type EaveType,
  type VentType,
} from '~~/shared/contracts/assessment'

definePageMeta({
  middleware: ['role'],
  // Field crews are the primary persona; org admins also need access to
  // back-fill or correct assessments.
  requiredRoles: [...ROLE_GROUPS.admin, 'field'],
})

useHead({ title: 'Assessment' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const assessment = useService('assessment')

const propertyId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const { data: propertyData } = await useAsyncData(
  () => `assessment-property-${propertyId.value}-${orgId.value}`,
  () => property.get(propertyId.value, orgId.value),
  { watch: [propertyId, orgId] },
)

const ROOF_OPTIONS: { value: RoofMaterial; label: string }[] = [
  { value: 'metal', label: 'Metal' },
  { value: 'tile', label: 'Tile' },
  { value: 'class_a_asphalt', label: 'Class A asphalt' },
  { value: 'standard_asphalt', label: 'Standard asphalt' },
  { value: 'wood_shake', label: 'Wood shake' },
  { value: 'other', label: 'Other' },
]
const SIDING_OPTIONS: { value: SidingMaterial; label: string }[] = [
  { value: 'fiber_cement', label: 'Fiber cement' },
  { value: 'stucco', label: 'Stucco' },
  { value: 'metal', label: 'Metal' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'brick', label: 'Brick' },
  { value: 'wood', label: 'Wood' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'other', label: 'Other' },
]
const EAVE_OPTIONS: { value: EaveType; label: string }[] = [
  { value: 'enclosed', label: 'Enclosed' },
  { value: 'boxed', label: 'Boxed' },
  { value: 'open', label: 'Open' },
  { value: 'other', label: 'Other' },
]
const VENT_OPTIONS: { value: VentType; label: string }[] = [
  { value: 'ember_resistant', label: 'Ember-resistant' },
  { value: 'standard_mesh', label: 'Standard mesh' },
  { value: 'unscreened', label: 'Unscreened' },
  { value: 'other', label: 'Other' },
]

interface FormState {
  roofMaterial: RoofMaterial | ''
  sidingMaterial: SidingMaterial | ''
  eaveType: EaveType | ''
  ventType: VentType | ''
  defensibleSpaceCleared: boolean
  notes: string
}
const form = reactive<FormState>({
  roofMaterial: '',
  sidingMaterial: '',
  eaveType: '',
  ventType: '',
  defensibleSpaceCleared: false,
  notes: '',
})

const errors = ref<Partial<Record<keyof FormState, string>>>({})
const serverError = ref('')
const submitting = ref(false)

function buildInput(): AssessmentCreateInput {
  return {
    organizationId: orgId.value,
    propertyId: propertyId.value,
    assessedById: userId.value,
    assessedAt: new Date().toISOString(),
    roofMaterial: (form.roofMaterial || 'other') as RoofMaterial,
    sidingMaterial: (form.sidingMaterial || 'other') as SidingMaterial,
    eaveType: (form.eaveType || 'other') as EaveType,
    ventType: (form.ventType || 'other') as VentType,
    defensibleSpaceCleared: form.defensibleSpaceCleared,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function validate(): boolean {
  for (const k of Object.keys(errors.value) as (keyof FormState)[]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete errors.value[k]
  }
  // We only validate user-controlled fields. Required: every material
  // must be a non-empty selection (the form starts blank to force the
  // user to make a choice rather than silently defaulting).
  if (!form.roofMaterial) errors.value.roofMaterial = 'Select a roof material'
  if (!form.sidingMaterial) errors.value.sidingMaterial = 'Select a siding material'
  if (!form.eaveType) errors.value.eaveType = 'Select an eave type'
  if (!form.ventType) errors.value.ventType = 'Select a vent type'
  if (Object.keys(errors.value).length > 0) return false

  // Belt + suspenders: validate the full enum shape via Zod too.
  const userSchema = AssessmentCreateInputSchema.omit({
    organizationId: true,
    propertyId: true,
    assessedById: true,
    assessedAt: true,
  })
  const { organizationId: _o, propertyId: _p, assessedById: _b, assessedAt: _a, ...rest } = buildInput()
  void _o; void _p; void _b; void _a
  const result = userSchema.safeParse(rest)
  if (result.success) return true
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof FormState | undefined
    if (key && !errors.value[key]) errors.value[key] = issue.message
  }
  return false
}

async function onSubmit() {
  serverError.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    await assessment.create(buildInput())
    // Stay client-side so the mock service's in-memory store survives the
    // navigation. A full goto would hit the SSR process whose module has
    // never seen the just-created row.
    await router.push(`/admin/properties/${propertyId.value}/assessment-summary`)
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not save assessment.'
  } finally {
    submitting.value = false
  }
}

const propertyAddress = computed(() => {
  const p = propertyData.value
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="assessment-form">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Assessment' },
      ]"
    />
    <h1 class="text-display mt-2">Property assessment</h1>
    <p v-if="propertyAddress" class="text-body text-text-secondary mt-1" data-testid="assessment-property-address">
      {{ propertyAddress }}
    </p>

    <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <BulwarkSelect
        v-model="form.roofMaterial"
        label="Roof material"
        :options="ROOF_OPTIONS"
        placeholder="Select roof material"
        :error="errors.roofMaterial"
        required
        data-testid="field-roofMaterial"
      />
      <BulwarkSelect
        v-model="form.sidingMaterial"
        label="Siding material"
        :options="SIDING_OPTIONS"
        placeholder="Select siding material"
        :error="errors.sidingMaterial"
        required
        data-testid="field-sidingMaterial"
      />
      <BulwarkSelect
        v-model="form.eaveType"
        label="Eave type"
        :options="EAVE_OPTIONS"
        placeholder="Select eave type"
        :error="errors.eaveType"
        required
        data-testid="field-eaveType"
      />
      <BulwarkSelect
        v-model="form.ventType"
        label="Vent type"
        :options="VENT_OPTIONS"
        placeholder="Select vent type"
        :error="errors.ventType"
        required
        data-testid="field-ventType"
      />

      <div class="flex items-center justify-between gap-4 py-2" data-testid="field-defensibleSpaceCleared">
        <BulwarkToggle
          v-model="form.defensibleSpaceCleared"
          label="Defensible space cleared"
          description="Vegetation cleared per state requirements."
          data-testid="defensible-space-toggle"
        />
      </div>

      <BulwarkTextarea
        v-model="form.notes"
        label="Notes (optional)"
        :error="errors.notes"
        data-testid="field-notes"
      />

      <p
        v-if="serverError"
        class="text-small text-status-error"
        role="alert"
        data-testid="server-error"
      >
        {{ serverError }}
      </p>

      <div class="flex items-center gap-3 mt-2">
        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="submitting"
          data-testid="submit-button"
        >
          Save assessment
        </BulwarkButton>
        <NuxtLink
          :to="`/admin/properties/${propertyId}`"
          class="text-body text-text-secondary hover:text-text-primary"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
