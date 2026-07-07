<!--
  app/pages/settings/templates.vue — document template text (E9-S6, made
  real in L12-S2).

  # Decisions (ADR-0008, ADR-0014)
    - Real editor over the two `pdf.*` label keys the compliance renderer
      actually consumes: the attestation/declaration sentence and the footer
      line. Saves go through the labels service (audited, tenant-scoped
      overrides; deleting an override reverts to the code default).
    - Layout/branding tokens (logo, colors, license label, support contact)
      come from /settings/branding and are linked, not duplicated.
    - Per-doc-type visual template variants remain a single fixed layout by
      design (one professional layout, tenant-controlled wording) — that is
      the shipped behavior, not a pending feature.

  # Decision cast down
    - The E9-S6 "lands with the real renderer" stub card. The renderer is
      real since E11-S10 and now reads these strings (sponsor directive
      2026-07-06: no future-promise placeholders in portals).
-->
<script setup lang="ts">
import { DEFAULT_LABELS } from '~~/shared/labels/defaults'
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Document templates' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const labelSvc = useService('label')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const FIELDS = [
  {
    namespace: 'pdf.declaration' as const,
    key: 'default',
    label: 'Compliance attestation',
    help: 'The certification sentence printed at the bottom of every compliance PDF.',
    testid: 'template-declaration',
  },
  {
    namespace: 'pdf.footer' as const,
    key: 'default',
    label: 'PDF footer line',
    help: 'Closing footer line on generated PDFs (contact hint, disclaimers).',
    testid: 'template-footer',
  },
]

const values = ref<Record<string, string>>({})
const savedValues = ref<Record<string, string>>({})
const saving = ref(false)

function defaultFor(namespace: string, key: string): string {
  return DEFAULT_LABELS[`${namespace}.${key}`] ?? ''
}

async function load() {
  const map = await labelSvc.getMap(orgId.value)
  for (const f of FIELDS) {
    const id = `${f.namespace}.${f.key}`
    values.value[id] = map[id] ?? defaultFor(f.namespace, f.key)
    savedValues.value[id] = values.value[id]!
  }
}
await load()

const dirty = computed(() =>
  FIELDS.some((f) => values.value[`${f.namespace}.${f.key}`] !== savedValues.value[`${f.namespace}.${f.key}`]),
)

async function save() {
  saving.value = true
  try {
    for (const f of FIELDS) {
      const id = `${f.namespace}.${f.key}`
      const next = (values.value[id] ?? '').trim()
      if (next === savedValues.value[id]) continue
      await labelSvc.upsert({
        organizationId: orgId.value,
        namespace: f.namespace,
        key: f.key,
        locale: 'en',
        value: next.length > 0 ? next : defaultFor(f.namespace, f.key),
      })
      savedValues.value[id] = values.value[id]!
    }
    toastSuccess('Templates saved', 'New wording applies to the next generated document.')
  } catch (err) {
    toastError('Could not save templates', (err as Error).message)
  } finally {
    saving.value = false
  }
}

function resetToDefault(namespace: string, key: string) {
  values.value[`${namespace}.${key}`] = defaultFor(namespace, key)
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-templates">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Document templates' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Document templates</h1>
      <p class="text-body text-text-secondary mt-1">
        The wording Bulwark prints on generated PDFs. Changes apply to the
        next document generated.
      </p>
    </header>

    <BulwarkCard
      v-for="f in FIELDS"
      :key="f.namespace"
      padding="md"
      class="mt-4"
      :data-testid="f.testid"
    >
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-body font-medium">{{ f.label }}</p>
          <p class="text-small text-text-secondary mt-1">{{ f.help }}</p>
        </div>
        <button
          class="text-tiny text-text-secondary underline shrink-0"
          :data-testid="`${f.testid}-reset`"
          @click="resetToDefault(f.namespace, f.key)"
        >
          Reset to default
        </button>
      </div>
      <BulwarkTextarea
        v-model="values[`${f.namespace}.${f.key}`]"
        label=""
        class="mt-3"
        :rows="3"
        :data-testid="`${f.testid}-input`"
      />
    </BulwarkCard>

    <div class="mt-4 flex justify-end">
      <BulwarkButton
        :disabled="!dirty || saving"
        :loading="saving"
        data-testid="templates-save"
        @click="save"
      >
        Save templates
      </BulwarkButton>
    </div>

    <BulwarkCard padding="md" class="mt-6" data-testid="templates-branding-link">
      <p class="text-body font-medium">Logo, colors &amp; license label</p>
      <p class="text-small text-text-secondary mt-1">
        The visual side of your documents — logo, heading color, CCB/license
        label, and support contact — is managed on the branding page and
        rendered into every PDF automatically.
      </p>
      <NuxtLink
        to="/settings/branding"
        class="text-small text-brand-primary underline mt-2 inline-block"
      >
        Open branding settings →
      </NuxtLink>
    </BulwarkCard>
  </div>
</template>
