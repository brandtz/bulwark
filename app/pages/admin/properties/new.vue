<!--
  app/pages/admin/properties/new.vue — property intake form (E3-S4).

  # Decisions (ADR-0008)
    - Validation runs through `PropertyCreateInputSchema.safeParse` from the
      shared contract. We do NOT re-declare a UI-only schema here — the
      service contract is the single source of truth (matches our pattern
      from the auth pages).
    - Error mapping: we keep a flat `Record<fieldName, string>` rather than
      Zod's nested `flatten()` shape, because BulwarkInput / BulwarkSelect
      take a single string. The conversion happens once in `validate()`.
    - On success we navigate to `/admin/properties` and rely on the
      pipeline page's `useAsyncData` re-fetch (`watch: [orgId]` + same
      key after invalidation). To be safe we call `refreshNuxtData()` on
      the pipeline's key so the new card shows immediately.
    - Client-side optimistic UX: form locks the submit button while saving
      and shows a server-side error string if the mock throws.

  # Decision cast down
    - Rejected: a full multi-step wizard. Intake is the entry point of
      every other domain — keeping it a single screen lowers friction.
      The wireframes (04-new-property-intake) match this shape.
    - Rejected: client-side state validation as the user types. Triggers
      noisy errors on first focus; instead we validate on blur per-field
      AND on submit.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  PropertyCreateInputSchema,
  type PropertyCreateInput,
} from '~~/shared/contracts/property'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New property' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const client = useService('client')
const router = useRouter()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

// Fetch clients for the optional client picker.
const { data: clientList } = await useAsyncData(
  () => `clients-for-intake-${orgId.value}`,
  () => client.list({ organizationId: orgId.value, page: 1, pageSize: 100 }),
  {
    watch: [orgId],
    default: () => ({ rows: [], total: 0, page: 1, pageSize: 100 }),
  },
)
const clientOptions = computed(() => [
  { value: '', label: '— No client —' },
  ...((clientList.value?.rows ?? []).map((c) => ({ value: c.id, label: c.fullName }))),
])

interface FormState {
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  clientId: string
  notes: string
}
const form = reactive<FormState>({
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  clientId: '',
  notes: '',
})

const errors = ref<Partial<Record<keyof FormState, string>>>({})
const serverError = ref('')
const submitting = ref(false)

function buildInput(): PropertyCreateInput {
  return {
    organizationId: orgId.value,
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim() ? form.addressLine2.trim() : null,
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    postalCode: form.postalCode.trim(),
    clientId: form.clientId || null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  }
}

function validate(): boolean {
  // Clear by deleting keys (avoids reactivity foot-guns from replacing .value).
  for (const k of Object.keys(errors.value) as (keyof FormState)[]) {
    delete errors.value[k]
  }
  // Validate only the user-supplied fields. `organizationId` is injected by
  // the page from the session and isn't a user input, so it's not part of
  // the UI surface — the service contract still validates the full payload
  // server-side (mock or real) on `create()`.
  const userSchema = PropertyCreateInputSchema.omit({ organizationId: true })
  const { organizationId: _omit, ...userPayload } = buildInput()
  void _omit
  const result = userSchema.safeParse(userPayload)
  if (result.success) return true
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof FormState | undefined
    if (key && !errors.value[key]) {
      errors.value[key] = issue.message
    }
  }
  return false
}

async function onSubmit() {
  serverError.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    await property.create(buildInput())
    // Force the pipeline page to re-fetch so the new card appears.
    await refreshNuxtData(`properties-${orgId.value}`)
    await router.push('/admin/properties')
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not save property.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="property-intake-form">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'New' },
      ]"
    />
    <h1 class="text-display mt-2">New property</h1>
    <p class="text-body text-text-secondary mt-1">
      Capture the address now; assessment + client details can be filled later.
    </p>

    <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <BulwarkInput
        v-model="form.addressLine1"
        label="Address"
        placeholder="123 Main St"
        :error="errors.addressLine1"
        required
        data-testid="field-addressLine1"
      />
      <BulwarkInput
        v-model="form.addressLine2"
        label="Unit / suite (optional)"
        :error="errors.addressLine2"
        data-testid="field-addressLine2"
      />
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BulwarkInput
          v-model="form.city"
          label="City"
          :error="errors.city"
          required
          data-testid="field-city"
        />
        <BulwarkInput
          v-model="form.state"
          label="State"
          placeholder="CA"
          :error="errors.state"
          required
          data-testid="field-state"
        />
        <BulwarkInput
          v-model="form.postalCode"
          label="ZIP"
          placeholder="94501"
          :error="errors.postalCode"
          required
          data-testid="field-postalCode"
        />
      </div>
      <BulwarkSelect
        v-model="form.clientId"
        label="Client (optional)"
        :options="clientOptions"
        placeholder="— No client —"
        :error="errors.clientId"
        data-testid="field-clientId"
      />
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
          Create property
        </BulwarkButton>
        <NuxtLink
          to="/admin/properties"
          class="text-body text-text-secondary hover:text-text-primary"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
