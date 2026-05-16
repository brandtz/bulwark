<!--
  app/pages/settings/numbering-defaults.vue — Numbering rules + org defaults
  (Wave 1B / EH-H Part A / W1-3).

  # Decisions (ADR-0008)
    - Single-page form. Loads `orgSettings.get(orgId)` (synthesises a
      defaults row on first read), edits in a reactive draft, calls
      `update()` on Save. Persistence is org-scoped per ADR-0002.
    - Numbering format inputs validate on the server (Zod refine).
      The page surfaces server errors verbatim.
    - Basis-points fields are kept as integers (1500 = 15.00%) to
      match contract shape; UI label says "(bps)" so admins know.

  # Decision cast down
    - Rejected: a separate "preview" field that calls the formatter
      live. The format hint string explains the tokens; over-engineered
      for a config page.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { NUMBERING_FORMAT_HINT, type OrgSettings } from '~~/shared/contracts/org-settings'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Numbering & defaults' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const svc = useService('orgSettings')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const settings = ref<OrgSettings | null>(null)
const loading = ref(false)
const saving = ref(false)
const serverError = ref('')

const form = reactive({
  quoteNumberFormat: '',
  woNumberFormat: '',
  invoiceNumberFormat: '',
  defaultMarkupBps: 0,
  defaultTaxBps: 0,
  defaultQuoteExpiryDays: 0,
  defaultInvoiceTermsDays: 0,
  defaultSlaDaysAssessment: 0,
  defaultSlaDaysQuote: 0,
})

function hydrate(s: OrgSettings) {
  form.quoteNumberFormat = s.quoteNumberFormat
  form.woNumberFormat = s.woNumberFormat
  form.invoiceNumberFormat = s.invoiceNumberFormat
  form.defaultMarkupBps = s.defaultMarkupBps
  form.defaultTaxBps = s.defaultTaxBps
  form.defaultQuoteExpiryDays = s.defaultQuoteExpiryDays
  form.defaultInvoiceTermsDays = s.defaultInvoiceTermsDays
  form.defaultSlaDaysAssessment = s.defaultSlaDaysAssessment
  form.defaultSlaDaysQuote = s.defaultSlaDaysQuote
}

async function load() {
  if (!orgId.value) return
  loading.value = true
  serverError.value = ''
  try {
    const s = await svc.get(orgId.value)
    settings.value = s
    hydrate(s)
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not load settings.'
  } finally {
    loading.value = false
  }
}
await load()

async function onSave() {
  serverError.value = ''
  saving.value = true
  try {
    const saved = await svc.update({
      organizationId: orgId.value,
      quoteNumberFormat: form.quoteNumberFormat,
      woNumberFormat: form.woNumberFormat,
      invoiceNumberFormat: form.invoiceNumberFormat,
      defaultMarkupBps: form.defaultMarkupBps,
      defaultTaxBps: form.defaultTaxBps,
      defaultQuoteExpiryDays: form.defaultQuoteExpiryDays,
      defaultInvoiceTermsDays: form.defaultInvoiceTermsDays,
      defaultSlaDaysAssessment: form.defaultSlaDaysAssessment,
      defaultSlaDaysQuote: form.defaultSlaDaysQuote,
    })
    settings.value = saved
    hydrate(saved)
    toastSuccess('Settings saved', 'Numbering & defaults updated.')
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
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-numbering">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Numbering & defaults' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Numbering & defaults</h1>
      <p class="text-body text-text-secondary mt-1">
        Number formats for quotes, work orders and invoices — plus the
        pricing &amp; SLA defaults that prefill new records.
      </p>
    </header>

    <p v-if="serverError" class="mt-4 text-small text-status-error" role="alert">{{ serverError }}</p>

    <div v-if="loading" class="mt-6 text-body text-text-secondary">Loading…</div>

    <form v-else class="mt-6 flex flex-col gap-6" @submit.prevent="onSave">
      <section data-testid="numbering-formats" class="flex flex-col gap-3">
        <h2 class="text-h2">Numbering formats</h2>
        <p class="text-small text-text-secondary">{{ NUMBERING_FORMAT_HINT }}</p>
        <BulwarkInput
          v-model="form.quoteNumberFormat"
          label="Quote number format"
          data-testid="numbering-quote-format"
        />
        <BulwarkInput
          v-model="form.woNumberFormat"
          label="Work order number format"
          data-testid="numbering-wo-format"
        />
        <BulwarkInput
          v-model="form.invoiceNumberFormat"
          label="Invoice number format"
          data-testid="numbering-invoice-format"
        />
      </section>

      <section data-testid="numbering-pricing" class="flex flex-col gap-3">
        <h2 class="text-h2">Pricing defaults</h2>
        <BulwarkInput
          :model-value="String(form.defaultMarkupBps)"
          label="Default markup (bps — 1500 = 15.00%)"
          data-testid="numbering-markup"
          @update:model-value="(v: string) => (form.defaultMarkupBps = Number(v) || 0)"
        />
        <BulwarkInput
          :model-value="String(form.defaultTaxBps)"
          label="Default tax (bps)"
          @update:model-value="(v: string) => (form.defaultTaxBps = Number(v) || 0)"
        />
      </section>

      <section data-testid="numbering-sla" class="flex flex-col gap-3">
        <h2 class="text-h2">SLA &amp; expiry defaults</h2>
        <BulwarkInput
          :model-value="String(form.defaultQuoteExpiryDays)"
          label="Default quote expiry (days)"
          @update:model-value="(v: string) => (form.defaultQuoteExpiryDays = Number(v) || 0)"
        />
        <BulwarkInput
          :model-value="String(form.defaultInvoiceTermsDays)"
          label="Default invoice terms (days)"
          @update:model-value="(v: string) => (form.defaultInvoiceTermsDays = Number(v) || 0)"
        />
        <BulwarkInput
          :model-value="String(form.defaultSlaDaysAssessment)"
          label="Default SLA: assessment turnaround (days)"
          @update:model-value="(v: string) => (form.defaultSlaDaysAssessment = Number(v) || 0)"
        />
        <BulwarkInput
          :model-value="String(form.defaultSlaDaysQuote)"
          label="Default SLA: quote turnaround (days)"
          @update:model-value="(v: string) => (form.defaultSlaDaysQuote = Number(v) || 0)"
        />
      </section>

      <footer class="flex items-center justify-end gap-2">
        <BulwarkButton
          variant="primary"
          type="submit"
          :disabled="saving"
          data-testid="numbering-save"
        >{{ saving ? 'Saving…' : 'Save settings' }}</BulwarkButton>
      </footer>
    </form>
  </div>
</template>
