<!--
  app/pages/admin/subcontractors/[id].vue — subcontractor detail + edit (E6-S5).

  # Decisions (ADR-0008)
    - One page, one form. Editing license info is the explicit ask in
      the epic; we extend the same form to cover contact info + trades
      because the user is already in an "edit this sub" context and the
      cost of one extra form section is near zero.
    - Save is a single mutation against `subcontractor.update`. The
      service merges + revalidates, so the page just sends the diff.
    - `{ server: false }` matches the rest of admin so the post-save
      refresh reads from the same client mock module.
    - License expiry uses native `<input type="date">` via
      `BulwarkDatePicker`. We translate yyyy-mm-dd → ISO at save time.

  # Decision cast down
    - Rejected: separate read-mode and edit-mode views. Mobile field
      crews don't browse subs; the only audience for this page is an
      admin who came here to fix something. Keep it editable.
    - Rejected: a Drawer pattern hanging off the list. Deep-link to
      a sub via URL is more useful for support tickets ("/sub/<id>").
    - Rejected: optimistic UI. The mutation is sub-millisecond against
      the mock; await + toast is honest and lets us swap the real API
      in later without re-architecting the page.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  TRADE_LABEL,
  TradeSchema,
  type Subcontractor,
  type SubcontractorUpdateInput,
  type Trade,
} from '~~/shared/contracts/subcontractor'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Subcontractor' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const subcontractor = useService('subcontractor')
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const subId = computed(() => String(route.params.id ?? ''))

const { success: toastSuccess, error: toastError } = useToast()

const { data: bundle, refresh } = await useAsyncData(
  () => `subcontractor-${subId.value}-${orgId.value}`,
  async () => {
    const sub = await subcontractor.get(subId.value, orgId.value)
    return { sub }
  },
  { server: false, watch: [subId, orgId] },
)

// Trade options for the multi-select.
const tradeOptions = TradeSchema.options.map((t) => ({
  value: t,
  label: TRADE_LABEL[t],
}))

// Editable form state — seeded from the loaded sub and reset on every reload.
const form = reactive({
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  trades: [] as string[],
  licenseNumber: '',
  licenseExpiresAt: '' as string, // yyyy-mm-dd for the date input
  notes: '',
})

const tradesError = ref('')
const submitError = ref('')
const submitting = ref(false)

function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  // Strip the time portion; date input wants yyyy-mm-dd.
  return iso.slice(0, 10)
}

function dateInputToIso(value: string): string | null {
  if (!value) return null
  return `${value}T00:00:00.000Z`
}

function seedForm(s: Subcontractor) {
  form.companyName = s.companyName
  form.contactName = s.contactName
  form.email = s.email ?? ''
  form.phone = s.phone
  form.trades = [...s.trades]
  form.licenseNumber = s.licenseNumber ?? ''
  form.licenseExpiresAt = isoToDateInput(s.licenseExpiresAt)
  form.notes = s.notes ?? ''
  tradesError.value = ''
  submitError.value = ''
}

watch(
  () => bundle.value?.sub?.id,
  () => {
    if (bundle.value?.sub) seedForm(bundle.value.sub)
  },
  { immediate: true },
)

async function onSubmit() {
  submitError.value = ''
  tradesError.value = ''
  if (form.trades.length === 0) {
    tradesError.value = 'Pick at least one trade.'
    return
  }
  submitting.value = true
  try {
    const patch: SubcontractorUpdateInput = {
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
    await subcontractor.update(subId.value, patch, orgId.value)
    await refresh()
    toastSuccess('Subcontractor saved', form.companyName.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed.'
    submitError.value = msg
    toastError('Could not save subcontractor', msg)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="subcontractor-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Subcontractors', to: '/admin/subcontractors' },
        { label: bundle?.sub?.companyName ?? 'Subcontractor' },
      ]"
    />

    <div v-if="!bundle?.sub" class="mt-6">
      <EmptyState
        icon="!"
        title="Subcontractor not found"
        body="This subcontractor either doesn't exist or belongs to another organization."
        :cta="{ label: 'Back to list', to: '/admin/subcontractors' }"
        data-testid="subcontractor-not-found"
      />
    </div>

    <form
      v-else
      class="mt-4 flex flex-col gap-4"
      data-testid="subcontractor-form"
      @submit.prevent="onSubmit"
    >
      <header>
        <h1 class="text-display" data-testid="subcontractor-name">
          {{ bundle.sub.companyName }}
        </h1>
        <p class="text-small text-text-secondary mt-1">
          Edit contact and license information.
        </p>
      </header>

      <BulwarkCard padding="md">
        <div class="flex flex-col gap-3">
          <BulwarkInput
            v-model="form.companyName"
            label="Company name"
            required
            data-testid="field-company-name"
          />
          <BulwarkInput
            v-model="form.contactName"
            label="Primary contact"
            required
            data-testid="field-contact-name"
          />
          <div class="grid gap-3 md:grid-cols-2">
            <BulwarkInput
              v-model="form.email"
              type="email"
              label="Email"
              autocomplete="email"
              data-testid="field-email"
            />
            <BulwarkInput
              v-model="form.phone"
              type="tel"
              label="Phone"
              autocomplete="tel"
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
          :error="tradesError"
          required
          data-testid="field-trades"
        />
      </BulwarkCard>

      <BulwarkCard padding="md">
        <h2 class="text-body font-medium text-text-primary mb-3">
          License information
        </h2>
        <div class="grid gap-3 md:grid-cols-2">
          <BulwarkInput
            v-model="form.licenseNumber"
            label="License number"
            placeholder="e.g. CCB-228114"
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
          label="Notes"
          placeholder="Internal notes about this subcontractor."
          data-testid="field-notes"
        />
      </BulwarkCard>

      <p
        v-if="submitError"
        class="text-small text-status-error"
        role="alert"
        data-testid="submit-error"
      >
        {{ submitError }}
      </p>

      <div class="flex gap-3">
        <BulwarkButton
          type="submit"
          variant="primary"
          :disabled="submitting"
          data-testid="save-button"
        >
          {{ submitting ? 'Saving…' : 'Save changes' }}
        </BulwarkButton>
        <NuxtLink
          to="/admin/subcontractors"
          class="inline-flex items-center px-4 h-input rounded-input text-body font-medium text-text-secondary hover:text-text-primary"
          data-testid="cancel-link"
        >
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>
