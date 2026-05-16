<!--
  app/pages/admin/properties/[id]/contacts.vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - Contacts can be propertyId-scoped OR clientId-scoped, but this
      page only operates on propertyId-scoped contacts (client-scoped
      contacts live on the client page in a later slice).
    - "Set primary" is a one-click button; the service demotes siblings
      inside the same transaction so we can refresh once afterward.
    - Kind values come from the label registry (namespace 'contact.kinds')
      so an org can rename "Site contact" → "Foreman" per ADR-0014.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { CONTACT_KIND_LABEL } from '~~/shared/contracts/contact'
import {
  canInviteHomeowner,
  type ContactInviteState,
} from '~/composables/contact-homeowner-invite-helpers'
import type { HomeownerKind } from '~~/shared/contracts/homeowner'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

const route = useRoute()
const propertyId = computed(() => String(route.params.id))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const contactSvc = useService('contact')
const homeownerSvc = useService('homeowner')
const { t } = useLabel()

const { data: contacts, refresh } = await useAsyncData(
  () => `contacts-${propertyId.value}-${orgId.value}`,
  () => contactSvc.listForProperty(propertyId.value, orgId.value),
  { default: () => [], watch: [propertyId, orgId] },
)

const { data: homeownerMembers, refresh: refreshHomeowner } = await useAsyncData(
  () => `ho-members-${propertyId.value}-${orgId.value}`,
  () => homeownerSvc.listForProperty(propertyId.value, orgId.value),
  { default: () => [], watch: [propertyId, orgId] },
)

const inviteState = (contact: { email: string | null }): ContactInviteState =>
  canInviteHomeowner(contact, homeownerMembers.value ?? [])

const HOMEOWNER_KIND_MAP: Record<string, HomeownerKind> = {
  owner: 'owner',
  tenant: 'tenant',
  spouse: 'spouse',
}
function mapHomeownerKind(contactKind: string): HomeownerKind {
  return HOMEOWNER_KIND_MAP[contactKind] ?? 'other'
}

const inviting = ref<string | null>(null)
const inviteError = ref<string | null>(null)
async function inviteAsHomeowner(c: {
  id: string
  email: string | null
  firstName: string
  lastName: string
  kind: string
}) {
  if (!c.email) return
  inviteError.value = null
  inviting.value = c.id
  try {
    await homeownerSvc.invite({
      organizationId: orgId.value,
      propertyId: propertyId.value,
      email: c.email,
      fullName: `${c.firstName} ${c.lastName}`.trim(),
      kind: mapHomeownerKind(c.kind),
      invitedByUserId: session.value?.userId ?? null,
    })
    await refreshHomeowner()
  } catch (err) {
    inviteError.value = err instanceof Error ? err.message : 'Could not send invite'
  } finally {
    inviting.value = null
  }
}

const showModal = ref(false)
const editing = ref<string | null>(null)
const draft = reactive({
  firstName: '',
  lastName: '',
  kind: 'owner',
  email: '',
  phone: '',
  isPrimary: false,
  notes: '',
})
const submitting = ref(false)
const submitError = ref<string | null>(null)

function resetDraft() {
  draft.firstName = ''
  draft.lastName = ''
  draft.kind = 'owner'
  draft.email = ''
  draft.phone = ''
  draft.isPrimary = false
  draft.notes = ''
  submitError.value = null
  editing.value = null
}

function openAdd() {
  resetDraft()
  showModal.value = true
}

function openEdit(id: string) {
  const c = contacts.value?.find((x) => x.id === id)
  if (!c) return
  draft.firstName = c.firstName
  draft.lastName = c.lastName
  draft.kind = c.kind
  draft.email = c.email ?? ''
  draft.phone = c.phone ?? ''
  draft.isPrimary = c.isPrimary
  draft.notes = c.notes ?? ''
  editing.value = id
  submitError.value = null
  showModal.value = true
}

async function submit() {
  if (!draft.firstName.trim() || !draft.lastName.trim()) {
    submitError.value = 'First and last name are required'
    return
  }
  submitting.value = true
  submitError.value = null
  try {
    if (editing.value) {
      await contactSvc.update({
        id: editing.value,
        organizationId: orgId.value,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        kind: draft.kind,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        isPrimary: draft.isPrimary,
        notes: draft.notes.trim() || null,
      })
    } else {
      await contactSvc.create({
        organizationId: orgId.value,
        propertyId: propertyId.value,
        clientId: null,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        kind: draft.kind,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        isPrimary: draft.isPrimary,
        notes: draft.notes.trim() || null,
      })
    }
    showModal.value = false
    resetDraft()
    await refresh()
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to save contact'
  } finally {
    submitting.value = false
  }
}

async function setPrimary(id: string) {
  await contactSvc.setPrimary(id, orgId.value)
  await refresh()
}

async function deleteContact(id: string) {
  if (!confirm('Delete this contact?')) return
  await contactSvc.softDelete(id, orgId.value)
  await refresh()
}

const KIND_OPTIONS = Object.keys(CONTACT_KIND_LABEL).map((k) => ({
  value: k,
  label: t('contact.kinds', k, CONTACT_KIND_LABEL[k] ?? k),
}))

useHead({ title: 'Contacts — Bulwark' })
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="property-contacts-page">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: t('property.tabs', 'contacts', 'Contacts') },
      ]"
    />

    <PropertyPropertyDepthNav :property-id="propertyId" class="mt-4" />

    <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 class="text-h1">{{ t('property.tabs', 'contacts', 'Contacts') }}</h1>
      <button
        type="button"
        class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
        data-testid="contact-add-button"
        @click="openAdd"
      >
        Add contact
      </button>
    </header>

    <BulwarkCard v-if="contacts && contacts.length > 0" padding="none">
      <ul class="divide-y divide-border-default" data-testid="contacts-list">
        <li
          v-for="c in contacts"
          :key="c.id"
          class="p-3 md:p-4 flex flex-wrap items-center justify-between gap-3"
          data-testid="contact-row"
          :data-contact-id="c.id"
          :data-is-primary="c.isPrimary ? 'true' : 'false'"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-body font-medium">{{ c.firstName }} {{ c.lastName }}</p>
              <span
                v-if="c.isPrimary"
                class="inline-flex items-center rounded-pill bg-primary text-white px-2 py-0.5 text-small"
                data-testid="contact-primary-badge"
              >Primary</span>
              <span
                class="inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-2 py-0.5 text-small"
              >{{ t('contact.kinds', c.kind, CONTACT_KIND_LABEL[c.kind] ?? c.kind) }}</span>
            </div>
            <p class="text-small text-text-secondary mt-0.5">
              {{ c.email ?? '—' }} · {{ c.phone ?? '—' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="inviteState(c) === 'enabled'">
              <button
                type="button"
                class="text-small text-primary hover:underline"
                data-testid="contact-invite-homeowner"
                :disabled="inviting === c.id"
                @click="inviteAsHomeowner(c)"
              >{{ inviting === c.id ? 'Inviting…' : 'Send portal invite' }}</button>
            </template>
            <span
              v-else-if="inviteState(c) === 'pending'"
              class="text-small text-text-secondary"
              data-testid="contact-invite-pending"
            >Portal invite sent</span>
            <span
              v-else-if="inviteState(c) === 'accepted'"
              class="text-small text-status-success"
              data-testid="contact-invite-accepted"
            >Portal member</span>
            <button
              v-if="!c.isPrimary"
              type="button"
              class="text-small text-primary hover:underline"
              data-testid="contact-set-primary"
              @click="setPrimary(c.id)"
            >
              Set primary
            </button>
            <button
              type="button"
              class="text-small text-primary hover:underline"
              data-testid="contact-edit"
              @click="openEdit(c.id)"
            >
              Edit
            </button>
            <button
              type="button"
              class="text-small text-status-error hover:underline"
              data-testid="contact-delete"
              @click="deleteContact(c.id)"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </BulwarkCard>

    <p
      v-if="inviteError"
      role="alert"
      class="mt-3 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
      data-testid="contact-invite-error"
    >{{ inviteError }}</p>

    <EmptyState
      v-else
      icon="·"
      title="No contacts yet"
      body="Add the property owner, site contact, or insurance contact."
      data-testid="contacts-empty-state"
    />

    <BulwarkModal v-model="showModal" :title="editing ? 'Edit contact' : 'Add contact'" data-testid="contact-modal">
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BulwarkInput v-model="draft.firstName" label="First name" required data-testid="contact-first-name-input" />
          <BulwarkInput v-model="draft.lastName" label="Last name" required data-testid="contact-last-name-input" />
        </div>
        <BulwarkSelect v-model="draft.kind" label="Kind" :options="KIND_OPTIONS" data-testid="contact-kind-select" />
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BulwarkInput v-model="draft.email" type="email" label="Email" />
          <BulwarkInput v-model="draft.phone" type="tel" label="Phone" />
        </div>
        <label class="inline-flex items-center gap-2 text-body">
          <input
            v-model="draft.isPrimary"
            type="checkbox"
            class="rounded border-border-default"
            data-testid="contact-is-primary"
          />
          Primary contact for this property
        </label>
        <BulwarkTextarea v-model="draft.notes" label="Notes" :rows="2" />
        <p v-if="submitError" class="text-small text-status-error" data-testid="contact-submit-error">{{ submitError }}</p>
        <div class="flex justify-end gap-2 mt-2">
          <button
            type="button"
            class="inline-flex h-input items-center rounded-input border border-border-default px-4 text-body"
            @click="showModal = false"
          >Cancel</button>
          <button
            type="submit"
            class="inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
            :disabled="submitting"
            data-testid="contact-submit"
          >
            {{ submitting ? 'Saving…' : (editing ? 'Save' : 'Create contact') }}
          </button>
        </div>
      </form>
    </BulwarkModal>
  </div>
</template>
