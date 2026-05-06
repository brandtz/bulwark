<!--
  app/pages/admin/clients/new.vue — client create form (E14-S5).

  # Decisions (ADR-0008)
    - Validates against `ClientCreateInputSchema` from the shared
      contract (single source of truth, same pattern as
      `properties/new.vue`).
    - On success: refresh the clients list cache key, navigate to the
      client's detail page so the operator can immediately link
      properties.
    - Edit lives on the detail page in a follow-up; the contract has
      no `update()` method on `IClientService` today and adding it is
      out of scope for E14 polish.

  # Decision cast down
    - Rejected: an inline modal on the clients list. The form has six
      fields and benefits from full-width on mobile; modal would force
      a smaller surface and a worse keyboard UX.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  ClientCreateInputSchema,
  type ClientCreateInput,
} from '~~/shared/contracts/client'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New client — Bulwark' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const client = useService('client')
const router = useRouter()
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

interface FormState {
  fullName: string
  email: string
  phone: string
  preferredContact: '' | 'email' | 'phone' | 'sms'
  notes: string
}
const form = reactive<FormState>({
  fullName: '',
  email: '',
  phone: '',
  preferredContact: '',
  notes: '',
})

const PREFERRED_OPTIONS = [
  { value: '', label: '— None —' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms', label: 'SMS' },
]

const errors = ref<Partial<Record<keyof FormState, string>>>({})
const serverError = ref('')
const submitting = ref(false)

function buildInput(): ClientCreateInput {
  return {
    organizationId: orgId.value,
    fullName: form.fullName.trim(),
    email: form.email.trim() === '' ? null : form.email.trim(),
    phone: form.phone.trim(),
    preferredContact: form.preferredContact === '' ? null : form.preferredContact,
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  }
}

function validate(): boolean {
  for (const k of Object.keys(errors.value) as (keyof FormState)[]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete errors.value[k]
  }
  const userSchema = ClientCreateInputSchema.omit({ organizationId: true })
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
    const created = await client.create(buildInput())
    await refreshNuxtData(`clients-${orgId.value}`)
    toastSuccess('Client created', created.fullName)
    await router.push(`/admin/clients/${created.id}`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not save client.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="client-intake-form">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Clients', to: '/admin/clients' },
        { label: 'New' },
      ]"
    />
    <h1 class="text-display mt-2">New client</h1>
    <p class="text-body text-text-secondary mt-1">
      Capture the homeowner's contact info now; properties can be linked from
      the property intake form.
    </p>

    <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <BulwarkInput
        v-model="form.fullName"
        label="Full name"
        placeholder="Jane Doe"
        :error="errors.fullName"
        required
        data-testid="field-fullName"
      />
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulwarkInput
          v-model="form.email"
          type="email"
          label="Email (optional)"
          autocomplete="email"
          :error="errors.email"
          data-testid="field-email"
        />
        <BulwarkInput
          v-model="form.phone"
          type="tel"
          label="Phone"
          autocomplete="tel"
          :error="errors.phone"
          required
          data-testid="field-phone"
        />
      </div>
      <BulwarkSelect
        v-model="form.preferredContact"
        label="Preferred contact"
        :options="PREFERRED_OPTIONS"
        :error="errors.preferredContact"
        data-testid="field-preferredContact"
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
          Create client
        </BulwarkButton>
        <NuxtLink
          to="/admin/clients"
          class="text-body text-text-secondary hover:text-text-primary"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
