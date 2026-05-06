<!--
  app/pages/admin/subcontractors/new.vue — subcontractor onboarding
  form (E14-S6).

  # Decisions (ADR-0008)
    - Mirrors the existing edit form on `[id].vue` so the look and the
      validation rules match. Uses the new
      `SubcontractorCreateInputSchema` from the contract for validation
      (added in this same epic).
    - Trades is a required multi-select; we surface a custom error
      because the schema's "min(1)" message is generic.
    - License fields are optional: a sub doing only general labor
      doesn't need a CCB number.

  # Decision cast down
    - Rejected: a multi-step wizard. Onboarding is short enough that a
      single screen with grouped sections beats a wizard, especially
      on phones.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  SubcontractorCreateInputSchema,
  TRADE_LABEL,
  TradeSchema,
  type SubcontractorCreateInput,
  type Trade,
} from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New subcontractor' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const subcontractor = useService('subcontractor')
const router = useRouter()
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const tradeOptions = TradeSchema.options.map((t) => ({
  value: t,
  label: TRADE_LABEL[t],
}))

const form = reactive({
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  trades: [] as string[],
  licenseNumber: '',
  licenseExpiresAt: '' as string,
  notes: '',
})

const errors = ref<Partial<Record<keyof typeof form, string>>>({})
const serverError = ref('')
const submitting = ref(false)

function dateInputToIso(value: string): string | null {
  if (!value) return null
  return `${value}T00:00:00.000Z`
}

function buildInput(): SubcontractorCreateInput {
  return {
    organizationId: orgId.value,
    companyName: form.companyName.trim(),
    contactName: form.contactName.trim(),
    email: form.email.trim() === '' ? null : form.email.trim(),
    phone: form.phone.trim(),
    trades: form.trades as Trade[],
    licenseNumber:
      form.licenseNumber.trim() === '' ? null : form.licenseNumber.trim(),
    licenseExpiresAt: dateInputToIso(form.licenseExpiresAt),
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  }
}

function validate(): boolean {
  for (const k of Object.keys(errors.value) as (keyof typeof form)[]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete errors.value[k]
  }
  if (form.trades.length === 0) {
    errors.value.trades = 'Pick at least one trade.'
    return false
  }
  const userSchema = SubcontractorCreateInputSchema.omit({ organizationId: true })
  const { organizationId: _omit, ...userPayload } = buildInput()
  void _omit
  const result = userSchema.safeParse(userPayload)
  if (result.success) return true
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof typeof form | undefined
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
    const created = await subcontractor.create(buildInput())
    await refreshNuxtData(`subcontractors-${orgId.value}`)
    toastSuccess('Subcontractor added', created.companyName)
    await router.push(`/admin/subcontractors/${created.id}`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not save subcontractor.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="subcontractor-intake-form">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Subcontractors', to: '/admin/subcontractors' },
        { label: 'New' },
      ]"
    />
    <h1 class="text-display mt-2">New subcontractor</h1>
    <p class="text-body text-text-secondary mt-1">
      Add a contractor to the trade-assignment pool.
    </p>

    <form
      class="mt-6 flex flex-col gap-4"
      novalidate
      data-testid="subcontractor-form"
      @submit.prevent="onSubmit"
    >
      <BulwarkCard padding="md">
        <div class="flex flex-col gap-3">
          <BulwarkInput
            v-model="form.companyName"
            label="Company name"
            :error="errors.companyName"
            required
            data-testid="field-company-name"
          />
          <BulwarkInput
            v-model="form.contactName"
            label="Primary contact"
            :error="errors.contactName"
            required
            data-testid="field-contact-name"
          />
          <div class="grid gap-3 md:grid-cols-2">
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
        </div>
      </BulwarkCard>

      <BulwarkCard padding="md">
        <BulwarkMultiSelect
          v-model="form.trades"
          label="Trades"
          :options="tradeOptions"
          :error="errors.trades"
          required
          data-testid="field-trades"
        />
      </BulwarkCard>

      <BulwarkCard padding="md">
        <h2 class="text-body font-medium text-text-primary mb-3">
          License information (optional)
        </h2>
        <div class="grid gap-3 md:grid-cols-2">
          <BulwarkInput
            v-model="form.licenseNumber"
            label="License number"
            placeholder="e.g. CCB-228114"
            :error="errors.licenseNumber"
            data-testid="field-license-number"
          />
          <BulwarkDatePicker
            v-model="form.licenseExpiresAt"
            label="License expires"
            data-testid="field-license-expires"
          />
        </div>
        <p class="text-small text-text-secondary mt-2">
          Leave empty for unlicensed labor (general labor only).
        </p>
      </BulwarkCard>

      <BulwarkCard padding="md">
        <BulwarkTextarea
          v-model="form.notes"
          label="Notes (optional)"
          placeholder="Internal notes about this subcontractor."
          :error="errors.notes"
          data-testid="field-notes"
        />
      </BulwarkCard>

      <p
        v-if="serverError"
        class="text-small text-status-error"
        role="alert"
        data-testid="server-error"
      >
        {{ serverError }}
      </p>

      <div class="flex items-center gap-3">
        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="submitting"
          data-testid="submit-button"
        >
          Create subcontractor
        </BulwarkButton>
        <NuxtLink
          to="/admin/subcontractors"
          class="text-body text-text-secondary hover:text-text-primary"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
