<!--
  app/pages/settings/company.vue — company / organization profile
  (E9-S2, made real in L12-S1).

  # Decisions (ADR-0008)
    - Real editor: org name + brand color persist via
      orgSettings.updateOrganizationProfile (audited, tenant-firewalled).
      Slug is shown read-only — it lives in URLs/e-mail links and renaming
      it would orphan them (contract decision).
    - Logo, CCB/license footer, and PDF branding live on /settings/branding
      (the branding singleton) — linked, not duplicated here.

  # Decision cast down
    - The old "Editable in a future release" card. The backend is real now;
      a coming-soon banner on a working write path is a lie (sponsor
      directive 2026-07-06: no future-promise placeholders in portals).
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Company' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const svc = useService('orgSettings')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const name = ref('')
const brandColor = ref('')
const slug = ref('')
const saving = ref(false)
const loadError = ref('')

async function load() {
  try {
    const p = await svc.getOrganizationProfile(orgId.value)
    name.value = p.name
    slug.value = p.slug
    brandColor.value = p.brandColor ?? ''
  } catch (err) {
    loadError.value = (err as Error).message
  }
}
await load()

const colorValid = computed(
  () => brandColor.value === '' || /^#[0-9a-fA-F]{6}$/.test(brandColor.value),
)
const canSave = computed(
  () => name.value.trim().length > 0 && colorValid.value && !saving.value,
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const p = await svc.updateOrganizationProfile({
      organizationId: orgId.value,
      name: name.value.trim(),
      brandColor: brandColor.value === '' ? null : brandColor.value,
    })
    name.value = p.name
    brandColor.value = p.brandColor ?? ''
    toastSuccess('Company updated', 'Organization profile saved.')
  } catch (err) {
    toastError('Could not save', (err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-company">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Company' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Company</h1>
      <p class="text-body text-text-secondary mt-1">
        Organization profile and branding.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6" data-testid="company-form">
      <p v-if="loadError" class="text-small text-status-error" data-testid="company-load-error">
        {{ loadError }}
      </p>
      <div v-else class="flex flex-col gap-4">
        <BulwarkInput
          v-model="name"
          label="Organization name"
          placeholder="Your company name"
          data-testid="company-name-input"
        />
        <div>
          <BulwarkInput
            v-model="brandColor"
            label="Brand color (hex)"
            placeholder="#1E3A8A"
            data-testid="company-brand-color-input"
          />
          <p v-if="!colorValid" class="text-small text-status-error mt-1">
            Use a 6-digit hex color like #1E3A8A, or leave blank.
          </p>
        </div>
        <div>
          <p class="text-small text-text-secondary">URL slug (read-only)</p>
          <p class="text-body mt-1"><code>{{ slug }}</code></p>
          <p class="text-tiny text-text-secondary mt-1">
            The slug appears in links and can't be changed — renaming it would
            break existing URLs and e-mailed links.
          </p>
        </div>
        <div class="flex justify-end">
          <BulwarkButton
            :disabled="!canSave"
            :loading="saving"
            data-testid="company-save"
            @click="save"
          >
            Save changes
          </BulwarkButton>
        </div>
      </div>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-4" data-testid="company-account-summary">
      <dl class="flex flex-col gap-3 text-body">
        <div class="flex justify-between">
          <dt class="text-text-secondary">Your role</dt>
          <dd>{{ session?.activeRole }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Email</dt>
          <dd>{{ session?.email }}</dd>
        </div>
      </dl>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-4" data-testid="company-branding-link">
      <p class="text-body font-medium">Logo, license footer &amp; PDF branding</p>
      <p class="text-small text-text-secondary mt-1">
        Logo, support contact, CCB/license label, and document colors are
        managed on the branding page.
      </p>
      <NuxtLink
        to="/settings/branding"
        class="text-small text-brand-primary underline mt-2 inline-block"
        data-testid="company-branding-cta"
      >
        Open branding settings →
      </NuxtLink>
    </BulwarkCard>
  </div>
</template>
