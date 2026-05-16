<!--
  app/pages/settings/branding.vue — per-tenant branding singleton (EH-B / W1-2 / ADR-0014).

  # Decisions (ADR-0008)
    - Admin-only via the role middleware. Branding rows are 1:1 with
      `organizations`, so this is a single form, not a list/CRUD.
    - The page loads `getBranding(orgId)` once; the mock + real services
      both synthesize sane defaults when the row is missing, so a fresh
      org renders an editable form on first visit.
    - Logo upload is deferred. The sponsor accepts a manual logo URL for
      Phase 1; an R2/S3 upload widget is tracked in the W1-2 handoff and
      Wave 2 backlog. We still render the URL preview so the admin can
      confirm the image resolves before saving.
    - Color inputs use the native `<input type="color">` plus a sibling
      text input for hex. Rationale: native pickers give us a real eye-
      dropper on Chromium and respect OS dark mode, while the text
      field is what zod validates (HexColor regex in the contract).

  # Decision cast down
    - Rejected: a separate "theme preview" section. The breadcrumbs and
      primary button on the form itself already use `bg-primary`, so an
      admin can see the color change reflected by saving and refreshing.
      A live preview is nice-to-have, not required.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { safeUrl } from '~/utils/safeUrl'
import { BrandingUpdateInputSchema, type Branding } from '~~/shared/contracts/label'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Branding' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const labelSvc = useService('label')
const { success: toastSuccess } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const initial = await labelSvc.getBranding(orgId.value)
const form = reactive<Branding>({ ...initial })
const serverError = ref('')
const fieldErrors = reactive<Record<string, string>>({})
const saving = ref(false)

// Locale option lists. Conservative — we ship what we know we support.
const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'Pacific/Honolulu',
].map((tz) => ({ value: tz, label: tz }))

const CURRENCIES = [{ value: 'USD', label: 'USD — US Dollar' }]

const DATE_FORMATS = [
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY' },
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY' },
]

async function onSave() {
  serverError.value = ''
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k]
  const parse = BrandingUpdateInputSchema.safeParse({
    organizationId: orgId.value,
    logoUrl: form.logoUrl,
    primaryColor: form.primaryColor,
    accentColor: form.accentColor,
    footerText: form.footerText,
    supportEmail: form.supportEmail,
    supportPhone: form.supportPhone,
    licenseLabel: form.licenseLabel,
    timezone: form.timezone,
    currencyCode: form.currencyCode,
    dateFormat: form.dateFormat,
  })
  if (!parse.success) {
    for (const issue of parse.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message
    }
    serverError.value = 'Please fix the highlighted fields.'
    return
  }
  saving.value = true
  try {
    Object.assign(form, await labelSvc.updateBranding(parse.data))
    toastSuccess('Branding saved', 'Your branding will appear on new exports and emails.')
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not save branding.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-branding">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Branding' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Branding</h1>
      <p class="text-body text-text-secondary mt-1">
        Customize how your org appears in PDFs, emails, and the app shell.
      </p>
    </header>

    <form class="mt-6 space-y-6" @submit.prevent="onSave">
      <BulwarkCard padding="md">
        <h2 class="text-h2">Logo</h2>
        <p class="text-small text-text-secondary mt-1">
          Paste a public image URL. Uploads from disk arrive in Wave 2.
        </p>
        <BulwarkInput
          v-model="form.logoUrl"
          label="Logo URL"
          placeholder="https://cdn.example.com/logo.png"
          :error="fieldErrors.logoUrl"
          class="mt-3"
        />
        <div v-if="safeUrl(form.logoUrl)" class="mt-3 p-3 rounded-card bg-surface-muted">
          <img
            :src="safeUrl(form.logoUrl) ?? ''"
            alt="Logo preview"
            class="max-h-16"
            data-testid="branding-logo-preview"
          >
        </div>
      </BulwarkCard>

      <BulwarkCard padding="md">
        <h2 class="text-h2">Colors</h2>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-end gap-2">
            <input
              v-model="form.primaryColor"
              type="color"
              class="h-input w-14 rounded-input border border-border bg-surface"
              aria-label="Primary color swatch"
            >
            <div class="flex-1">
              <BulwarkInput
                v-model="form.primaryColor"
                label="Primary color"
                :error="fieldErrors.primaryColor"
                data-testid="branding-primary-color"
              />
            </div>
          </div>
          <div class="flex items-end gap-2">
            <input
              v-model="form.accentColor"
              type="color"
              class="h-input w-14 rounded-input border border-border bg-surface"
              aria-label="Accent color swatch"
            >
            <div class="flex-1">
              <BulwarkInput
                v-model="form.accentColor"
                label="Accent color"
                :error="fieldErrors.accentColor"
                data-testid="branding-accent-color"
              />
            </div>
          </div>
        </div>
      </BulwarkCard>

      <BulwarkCard padding="md">
        <h2 class="text-h2">Footer &amp; contact</h2>
        <div class="mt-3 space-y-3">
          <BulwarkTextarea
            v-model="form.footerText"
            label="PDF footer text"
            :rows="3"
            hint="Shows at the bottom of generated PDFs."
            :error="fieldErrors.footerText"
            data-testid="branding-footer-text"
          />
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BulwarkInput
              v-model="form.supportEmail"
              label="Support email"
              type="email"
              :error="fieldErrors.supportEmail"
            />
            <BulwarkInput
              v-model="form.supportPhone"
              label="Support phone"
              type="tel"
              :error="fieldErrors.supportPhone"
            />
            <BulwarkInput
              v-model="form.licenseLabel"
              label="License label"
              :error="fieldErrors.licenseLabel"
              hint="e.g. CSLB #123456"
            />
          </div>
        </div>
      </BulwarkCard>

      <BulwarkCard padding="md">
        <h2 class="text-h2">Locale defaults</h2>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <BulwarkSelect
            v-model="form.timezone"
            label="Timezone"
            :options="TIMEZONES"
            :error="fieldErrors.timezone"
          />
          <BulwarkSelect
            v-model="form.currencyCode"
            label="Currency"
            :options="CURRENCIES"
            :error="fieldErrors.currencyCode"
          />
          <BulwarkSelect
            v-model="form.dateFormat"
            label="Date format"
            :options="DATE_FORMATS"
            :error="fieldErrors.dateFormat"
          />
        </div>
      </BulwarkCard>

      <p
        v-if="serverError"
        class="text-small text-status-error"
        data-testid="branding-error"
      >
        {{ serverError }}
      </p>

      <div class="flex justify-end">
        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="saving"
          data-testid="branding-save-button"
        >
          Save branding
        </BulwarkButton>
      </div>
    </form>
  </div>
</template>
