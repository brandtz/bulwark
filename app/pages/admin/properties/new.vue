<!--
  app/pages/admin/properties/new.vue — AD-11 property intake (WP-B2).

  One page, cards in order: Address · Client · Programs · Buildings ·
  Contacts · Photos, with a sticky aside (checklist that ticks live, what
  happens next) at >= 1280 and a sticky Cancel/Create bar on phones.

  Address: with a geo provider the street field is an autocomplete
  (debounced 200ms, first result preselected; picking fills the fields);
  "Enter address manually" swaps to street/city/state/ZIP + APN. With the
  none driver (ED-00C) manual fields are the default and no suggestion list
  ever renders. The address is duplicate-checked: a match shows a warning
  with Open existing, and admins may Create anyway.

  Client is required: a searchable picker whose footer creates a client
  inline (name, phone, email) — server field errors (WP-X4) land on the
  inline fields. Programs are pressable chips (selection order kept for
  template precedence). Buildings start with a "Main" row that cannot be
  removed; contacts are optional rows. Photos queue here and upload after
  the property exists, continuing in the background on the hub.

  Create → AD-12 hub; Save & add inspection → the hub's inspection form.
  Leaving with unsaved input asks first.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { uploadAsset } from '~/composables/useUpload'
import { fieldErrors } from '~~/shared/utils/rpc-error'
import type { GeoSuggestion } from '~~/shared/contracts/geo'
import type { Program } from '~~/shared/contracts/program'
import type { Client } from '~~/shared/contracts/client'
import type { Property } from '~~/shared/contracts/property'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'New property' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const isAdmin = computed(() => ['super_admin', 'org_admin'].includes(session.value?.activeRole ?? ''))

const propertySvc = useService('property')
const clientSvc = useService('client')
const programSvc = useService('program')
const buildingSvc = useService('building')
const contactSvc = useService('contact')
const geoSvc = useService('geo')
const photoSvc = useService('propertyPhoto')
const route = useRoute()
const router = useRouter()
const toast = useToast()

const { data: refs } = await useAsyncData(
  () => `intake-refs-${orgId.value}`,
  async () => {
    const org = orgId.value
    const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn() } catch { return fallback }
    }
    const [clients, programs, geo] = await Promise.all([
      safe(async () => (await clientSvc.list({ organizationId: org, page: 1, pageSize: 200 })).rows, [] as Client[]),
      safe(async () => (await programSvc.list({ organizationId: org, page: 1, pageSize: 100 })).rows.filter((p) => p.isActive), [] as Program[]),
      safe(() => geoSvc.status(org), { provider: 'none' as const, enabled: false }),
    ])
    return { clients, programs, geoEnabled: geo.enabled }
  },
  { watch: [orgId] },
)

// ---- form state ----------------------------------------------------------------
const form = reactive({
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  parcelNumber: '',
  clientId: typeof route.query.clientId === 'string' ? route.query.clientId : '',
  notes: '',
})
const programIds = ref<string[]>([])
interface BuildingRow { key: number, name: string, kind: string, squareFeet: string }
interface ContactRow { key: number, firstName: string, lastName: string, email: string, phone: string, kind: string }
let rowKey = 0
const buildings = ref<BuildingRow[]>([{ key: rowKey++, name: 'Main', kind: 'house', squareFeet: '' }])
const contacts = ref<ContactRow[]>([])
const photos = ref<File[]>([])
const errors = ref<Record<string, string>>({})
const serverError = ref('')
const saving = ref(false)

const manual = ref(true)
watch(() => refs.value?.geoEnabled, (on) => { manual.value = !on }, { immediate: true })

const dirty = computed(() => !!(form.addressLine1 || form.city || form.postalCode || form.clientId || programIds.value.length || contacts.value.length || photos.value.length))

// ---- address autocomplete (geo provider only) -------------------------------------
const query = ref('')
const suggestions = ref<GeoSuggestion[]>([])
const activeSuggestion = ref(0)
const suggestOpen = ref(false)
let suggestTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(suggestTimer)
  if (manual.value || q.trim().length < 3) {
    suggestions.value = []
    suggestOpen.value = false
    return
  }
  suggestTimer = setTimeout(async () => {
    try {
      suggestions.value = await geoSvc.autocomplete({ organizationId: orgId.value, query: q.trim(), limit: 5 })
    } catch {
      suggestions.value = []
    }
    activeSuggestion.value = 0
    suggestOpen.value = suggestions.value.length > 0
  }, 200)
})
function pickSuggestion(s: GeoSuggestion) {
  form.addressLine1 = s.addressLine1
  form.city = s.city
  form.state = s.state
  form.postalCode = s.postalCode
  query.value = s.label
  suggestOpen.value = false
}
function onSuggestKey(e: KeyboardEvent) {
  if (!suggestOpen.value) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = suggestions.value.length
    activeSuggestion.value = (activeSuggestion.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const s = suggestions.value[activeSuggestion.value]
    if (s) pickSuggestion(s)
  } else if (e.key === 'Escape') {
    suggestOpen.value = false
  }
}

// ---- duplicate check ----------------------------------------------------------------
const duplicate = ref<Property | null>(null)
const allowDuplicate = ref(false)
let dupTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [form.addressLine1, form.city] as const, ([line1, city]) => {
  clearTimeout(dupTimer)
  duplicate.value = null
  allowDuplicate.value = false
  if (line1.trim().length < 4) return
  dupTimer = setTimeout(async () => {
    try {
      const res = await propertySvc.list({ organizationId: orgId.value, search: line1.trim(), page: 1, pageSize: 10 })
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/gu, ' ')
      duplicate.value = res.rows.find((p) => norm(p.addressLine1) === norm(line1) && (!city.trim() || norm(p.city) === norm(city))) ?? null
    } catch {
      duplicate.value = null
    }
  }, 300)
})

// ---- client picker + inline create ----------------------------------------------------
const clientOptions = computed(() => (refs.value?.clients ?? []).map((c) => ({ value: c.id, label: c.fullName, meta: c.email ?? c.phone })))
const selectedClient = computed(() => refs.value?.clients.find((c) => c.id === form.clientId) ?? null)
const newClient = reactive({ open: false, fullName: '', phone: '', email: '', saving: false, errors: {} as Record<string, string> })
function startNewClient(text: string) {
  Object.assign(newClient, { open: true, fullName: text ?? '', phone: '', email: '', saving: false, errors: {} })
}
async function saveNewClient() {
  newClient.saving = true
  newClient.errors = {}
  try {
    const created = await clientSvc.create({
      organizationId: orgId.value,
      fullName: newClient.fullName.trim(),
      phone: newClient.phone.trim(),
      email: newClient.email.trim() || null,
      preferredContact: newClient.email.trim() ? 'email' : 'phone',
      notes: null,
    })
    refs.value?.clients.unshift(created)
    form.clientId = created.id
    newClient.open = false
  } catch (e) {
    const fe = fieldErrors(e)
    newClient.errors = Object.keys(fe).length ? fe : { _: String((e as Error)?.message ?? e) }
  } finally {
    newClient.saving = false
  }
}

// ---- programs / rows / photos ------------------------------------------------------------
function toggleProgram(id: string, on: boolean) {
  programIds.value = on ? [...programIds.value.filter((x) => x !== id), id] : programIds.value.filter((x) => x !== id)
}
const addBuilding = () => buildings.value.push({ key: rowKey++, name: '', kind: 'house', squareFeet: '' })
const addContact = () => contacts.value.push({ key: rowKey++, firstName: '', lastName: '', email: '', phone: '', kind: 'owner' })
const PHOTO_MAX = 12 * 1024 * 1024
const photoError = ref('')
function addPhotos(list: FileList | File[] | null | undefined) {
  photoError.value = ''
  for (const f of Array.from(list ?? [])) {
    if (!/^image\/(jpeg|png)$/u.test(f.type)) { photoError.value = `${f.name}: only JPG or PNG`; continue }
    if (f.size > PHOTO_MAX) { photoError.value = `${f.name}: larger than 12 MB`; continue }
    photos.value.push(f)
  }
}
const dropActive = ref(false)

// ---- checklist --------------------------------------------------------------------------------
const checklist = computed(() => [
  { label: 'Address', done: !!(form.addressLine1.trim() && form.city.trim() && form.state.trim() && form.postalCode.trim()) },
  { label: 'Client', done: !!form.clientId },
  { label: 'Program', done: programIds.value.length > 0 },
  { label: 'Buildings', done: buildings.value.some((b) => b.name.trim()) },
  { label: 'Photos', done: photos.value.length > 0 },
])

// ---- validation + submit ----------------------------------------------------------------------
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.addressLine1.trim()) e.addressLine1 = 'Enter the street address.'
  if (!form.city.trim()) e.city = 'Enter the city.'
  if (!/^[A-Za-z]{2}$/u.test(form.state.trim())) e.state = 'Use the 2-letter state code.'
  if (!/^\d{5}$|^\d{5}-\d{4}$/u.test(form.postalCode.trim())) e.postalCode = 'Use a 5-digit ZIP code.'
  if (!form.clientId) e.clientId = 'Choose or create a client.'
  buildings.value.forEach((b, i) => { if (!b.name.trim()) e[`building.${i}`] = 'Name the building or remove the row.' })
  contacts.value.forEach((c, i) => { if (!c.firstName.trim() || !c.lastName.trim()) e[`contact.${i}`] = 'First and last name are required.' })
  errors.value = e
  return Object.keys(e).length === 0
}
const errorSummary = computed(() => Object.values(errors.value))

async function submit(next: 'hub' | 'inspection') {
  serverError.value = ''
  if (!validate()) return
  if (duplicate.value && !allowDuplicate.value) {
    serverError.value = 'This address already exists. Open the existing property or choose Create anyway.'
    return
  }
  saving.value = true
  let created: Property
  try {
    created = await propertySvc.create({
      organizationId: orgId.value,
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      postalCode: form.postalCode.trim(),
      clientId: form.clientId,
      notes: form.notes.trim() || null,
      parcelNumber: form.parcelNumber.trim() || null,
    })
  } catch (e) {
    const fe = fieldErrors(e)
    if (Object.keys(fe).length) errors.value = { ...errors.value, ...fe }
    serverError.value = String((e as Error)?.message ?? e).replace(/^Invalid input: /u, 'Check ')
    saving.value = false
    return
  }
  // Follow-ups never undo the property; failures are reported for the hub.
  const org = orgId.value
  const id = created.id
  const followUps = await Promise.allSettled([
    ...programIds.value.map((programId) => programSvc.assignToEntity({ organizationId: org, programId, entityType: 'property', entityId: id })),
    ...buildings.value.map((b, i) => buildingSvc.create({ organizationId: org, propertyId: id, name: b.name.trim(), kind: b.kind, squareFeet: b.squareFeet ? Number(b.squareFeet) : null, sortOrder: i })),
    ...contacts.value.map((c, i) => contactSvc.create({ organizationId: org, propertyId: id, kind: c.kind, firstName: c.firstName.trim(), lastName: c.lastName.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null, isPrimary: i === 0, sortOrder: i })),
  ])
  const failed = followUps.filter((r) => r.status === 'rejected').length
  queuePhotoUploads(id, [...photos.value])
  leaving = true
  saving.value = false
  toast.push({
    title: `${created.addressLine1} added`,
    body: failed ? `${failed} detail(s) didn't save — finish them on the property.` : undefined,
    tone: failed ? 'warning' : 'success',
  })
  await refreshNuxtData(`properties-${org}`)
  await router.push(next === 'inspection' ? `/admin/properties/${id}/assessment` : `/admin/properties/${id}`)
}

/** Uploads continue after navigation; the outcome arrives as a toast. */
function queuePhotoUploads(propertyId: string, files: File[]) {
  if (!files.length) return
  const org = orgId.value
  void (async () => {
    let ok = 0
    for (const file of files) {
      try {
        const asset = await uploadAsset({ organizationId: org, entity: 'property_photo', entityId: propertyId, file })
        await photoSvc.create({ organizationId: org, propertyId, buildingId: null, sectionId: null, url: asset.key, thumbnailUrl: null, caption: null, takenAt: null })
        ok++
      } catch { /* reported below */ }
    }
    toast.push({ title: `${ok} of ${files.length} photo(s) uploaded`, tone: ok === files.length ? 'success' : 'warning', body: ok === files.length ? undefined : 'Retry the rest from the Photos tab.' })
  })()
}

// ---- leave guard -------------------------------------------------------------------------------
let leaving = false
const leaveTo = ref<string | null>(null)
onBeforeRouteLeave((to) => {
  if (leaving || !dirty.value) return true
  leaveTo.value = to.fullPath
  return false
})
function confirmLeave() {
  leaving = true
  const to = leaveTo.value
  leaveTo.value = null
  if (to) void router.push(to)
}
</script>

<template>
  <div class="p-4 md:p-6" :class="'pb-28 xl:pb-6'" data-testid="property-intake-form">
    <BulwarkPageHeader title="New property" :breadcrumbs="[{ label: 'Properties', to: '/admin/properties' }, { label: 'New' }]" />

    <div class="mt-4 flex flex-col xl:flex-row gap-6 items-start">
      <form class="flex flex-col gap-4 w-full xl:max-w-[720px]" novalidate @submit.prevent="submit('hub')">
        <BulwarkBanner v-if="errorSummary.length" tone="danger" data-testid="intake-error-summary">
          Fix {{ errorSummary.length }} {{ errorSummary.length === 1 ? 'field' : 'fields' }} before creating the property.
        </BulwarkBanner>
        <BulwarkBanner v-if="serverError" tone="danger" data-testid="server-error">{{ serverError }}</BulwarkBanner>

        <!-- Address -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Address" />
          <div v-if="!manual" class="relative">
            <div class="bw-field">
              <label for="intake-address-search" class="bw-label">Search address<span class="req" aria-hidden="true">*</span></label>
              <input
                id="intake-address-search"
                v-model="query"
                type="text"
                class="bw-input"
                :class="errors.addressLine1 && 'is-error'"
                placeholder="Start typing a street address"
                role="combobox"
                aria-autocomplete="list"
                autocomplete="off"
                :aria-expanded="suggestOpen"
                aria-controls="intake-suggestions"
                :aria-activedescendant="suggestOpen ? `intake-sugg-${activeSuggestion}` : undefined"
                :aria-invalid="!!errors.addressLine1"
                data-testid="address-search"
                @keydown="onSuggestKey"
              >
              <p v-if="errors.addressLine1" class="bw-error" role="alert">{{ errors.addressLine1 }}</p>
            </div>
            <ul v-if="suggestOpen" id="intake-suggestions" role="listbox" class="bw-menu absolute left-0 right-0 mt-1" style="z-index: var(--z-dropdown)">
              <li
                v-for="(s, i) in suggestions"
                :id="`intake-sugg-${i}`"
                :key="s.id"
                role="option"
                class="item"
                :class="i === activeSuggestion && 'is-on'"
                :aria-selected="i === activeSuggestion"
                @mousedown.prevent="pickSuggestion(s)"
              >{{ s.label }}</li>
            </ul>
            <p v-if="form.addressLine1" class="bw-help mt-2" data-testid="address-picked">{{ form.addressLine1 }}, {{ form.city }}, {{ form.state }} {{ form.postalCode }}</p>
            <button type="button" class="bw-link mt-2" @click="manual = true">Enter address manually</button>
          </div>
          <fieldset v-else class="flex flex-col gap-4">
            <legend class="sr-only">Address</legend>
            <BulwarkInput v-model="form.addressLine1" label="Street address" placeholder="123 Main St" :error="errors.addressLine1" required data-testid="field-addressLine1" />
            <BulwarkInput v-model="form.addressLine2" label="Unit / suite" :error="errors.addressLine2" data-testid="field-addressLine2" />
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BulwarkInput v-model="form.city" label="City" :error="errors.city" required data-testid="field-city" />
              <BulwarkInput v-model="form.state" label="State" placeholder="OR" :maxlength="2" :error="errors.state" required data-testid="field-state" />
              <BulwarkInput v-model="form.postalCode" label="ZIP" inputmode="numeric" :error="errors.postalCode" required data-testid="field-postalCode" />
            </div>
            <BulwarkInput v-model="form.parcelNumber" label="Parcel / APN (optional)" data-testid="field-parcelNumber" />
            <button v-if="refs?.geoEnabled" type="button" class="bw-link self-start" @click="manual = false">Search for the address instead</button>
          </fieldset>
          <BulwarkBanner v-if="duplicate" tone="warning" class="mt-4" data-testid="duplicate-warning">
            <p><strong>{{ duplicate.addressLine1 }}, {{ duplicate.city }}</strong> is already in the pipeline.</p>
            <div class="flex gap-2 mt-2 flex-wrap">
              <NuxtLink :to="`/admin/properties/${duplicate.id}`" class="bw-btn bw-btn--primary bw-btn--sm" data-testid="duplicate-open">Open existing</NuxtLink>
              <BulwarkButton v-if="isAdmin" variant="ghost" size="sm" :aria-pressed="allowDuplicate" data-testid="duplicate-create-anyway" @click="allowDuplicate = true">
                {{ allowDuplicate ? 'Will create a second property' : 'Create anyway' }}
              </BulwarkButton>
            </div>
          </BulwarkBanner>
        </BulwarkCard>

        <!-- Client -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Client" />
          <BulwarkSelect
            v-model="form.clientId"
            label="Client"
            :options="clientOptions"
            searchable
            required
            placeholder="Search clients"
            create-label="Create a new client"
            :error="errors.clientId"
            data-testid="field-clientId"
            @create="startNewClient"
          />
          <p v-if="selectedClient" class="bw-help mt-2" data-testid="client-linked">Linked: {{ selectedClient.fullName }}<template v-if="selectedClient.phone"> · {{ selectedClient.phone }}</template></p>
          <div v-if="newClient.open" class="mt-4 flex flex-col gap-3 p-3" style="border: 1px dashed var(--border-default); border-radius: var(--radius-md)" data-testid="new-client-form">
            <BulwarkInput v-model="newClient.fullName" label="Client name" required :error="newClient.errors.fullName" data-testid="new-client-name" />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BulwarkInput v-model="newClient.phone" label="Phone" type="tel" required :error="newClient.errors.phone" data-testid="new-client-phone" />
              <BulwarkInput v-model="newClient.email" label="Email" type="email" :error="newClient.errors.email" data-testid="new-client-email" />
            </div>
            <p v-if="newClient.errors._" class="bw-error" role="alert">{{ newClient.errors._ }}</p>
            <div class="flex gap-2">
              <BulwarkButton size="sm" :loading="newClient.saving" data-testid="new-client-save" @click="saveNewClient">Save client</BulwarkButton>
              <BulwarkButton size="sm" variant="secondary" @click="newClient.open = false">Cancel</BulwarkButton>
            </div>
          </div>
        </BulwarkCard>

        <!-- Programs -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Programs" description="Programs pick the inspection template and deliverables." />
          <div v-if="refs?.programs.length" class="flex flex-wrap gap-2" role="group" aria-label="Programs">
            <BulwarkChips
              v-for="pr in refs.programs"
              :key="pr.id"
              variant="pressable"
              size="md"
              :pressed="programIds.includes(pr.id)"
              data-testid="program-chip"
              @toggle="(on: boolean) => toggleProgram(pr.id, on)"
            >{{ pr.name }}</BulwarkChips>
          </div>
          <p v-else class="bw-help">No active programs. Add them in Settings → Programs.</p>
        </BulwarkCard>

        <!-- Buildings -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Buildings" />
          <ul class="flex flex-col gap-3">
            <li v-for="(b, i) in buildings" :key="b.key" class="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end" data-testid="intake-building-row">
              <BulwarkInput v-model="b.name" :label="`Building ${i + 1} name`" :error="errors[`building.${i}`]" />
              <BulwarkInput v-model="b.kind" label="Type" class="hidden md:block" />
              <BulwarkInput v-model="b.squareFeet" label="Sq ft" inputmode="numeric" class="hidden md:block" />
              <BulwarkButton v-if="i > 0" variant="ghost" size="sm" :aria-label="`Remove ${b.name || `building ${i + 1}`}`" @click="buildings.splice(i, 1)"><BulwarkIcon name="trash" size="sm" /></BulwarkButton>
              <span v-else class="bw-help pb-2">Required</span>
            </li>
          </ul>
          <BulwarkButton variant="secondary" size="sm" class="mt-3" data-testid="intake-add-building" @click="addBuilding"><BulwarkIcon name="plus" size="sm" /> Add building</BulwarkButton>
        </BulwarkCard>

        <!-- Contacts -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Contacts" description="Optional. The client stays the owner of record." />
          <ul v-if="contacts.length" class="flex flex-col gap-3">
            <li v-for="(c, i) in contacts" :key="c.key" class="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end" data-testid="intake-contact-row">
              <BulwarkInput v-model="c.firstName" label="First name" :error="errors[`contact.${i}`]" />
              <BulwarkInput v-model="c.lastName" label="Last name" />
              <BulwarkInput v-model="c.phone" label="Phone" type="tel" />
              <BulwarkButton variant="ghost" size="sm" :aria-label="`Remove contact ${i + 1}`" @click="contacts.splice(i, 1)"><BulwarkIcon name="trash" size="sm" /></BulwarkButton>
            </li>
          </ul>
          <BulwarkButton variant="secondary" size="sm" class="mt-3" data-testid="intake-add-contact" @click="addContact"><BulwarkIcon name="plus" size="sm" /> Add contact</BulwarkButton>
        </BulwarkCard>

        <!-- Photos -->
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Photos" description="JPG or PNG, up to 12 MB each. Uploads continue after you create the property." />
          <div
            class="flex flex-col items-center gap-2 p-6 text-center"
            :style="`border: 2px dashed ${dropActive ? 'var(--accent)' : 'var(--border-default)'}; border-radius: var(--radius-lg); background: ${dropActive ? 'var(--accent-50, var(--bg-sunken))' : 'transparent'}`"
            data-testid="intake-dropzone"
            @dragover.prevent="dropActive = true"
            @dragleave="dropActive = false"
            @drop.prevent="dropActive = false; addPhotos($event.dataTransfer?.files)"
          >
            <BulwarkIcon name="camera" />
            <p>Drop photos here or</p>
            <label class="bw-btn bw-btn--secondary bw-btn--sm cursor-pointer">
              Browse
              <input type="file" accept="image/jpeg,image/png" multiple class="sr-only" data-testid="intake-photo-input" @change="addPhotos(($event.target as HTMLInputElement).files)">
            </label>
          </div>
          <p v-if="photoError" class="bw-error mt-2" role="alert">{{ photoError }}</p>
          <p class="bw-help mt-2" aria-live="polite">{{ photos.length ? `${photos.length} photo(s) ready to upload` : '' }}</p>
          <ul v-if="photos.length" class="mt-2 flex flex-col gap-1">
            <li v-for="(f, i) in photos" :key="`${f.name}-${i}`" class="flex items-center gap-2 bw-help">
              <BulwarkIcon name="image" size="sm" />{{ f.name }}
              <button type="button" class="bw-link ml-auto" :aria-label="`Remove ${f.name}`" @click="photos.splice(i, 1)">Remove</button>
            </li>
          </ul>
        </BulwarkCard>

        <div class="hidden xl:flex gap-3 justify-end">
          <NuxtLink to="/admin/properties" class="bw-btn bw-btn--secondary" data-testid="cancel-link">Cancel</NuxtLink>
          <BulwarkButton variant="secondary" :disabled="saving" data-testid="save-and-inspect" @click="submit('inspection')">Save &amp; add inspection</BulwarkButton>
          <BulwarkButton type="submit" :loading="saving" data-testid="submit-button">Create property</BulwarkButton>
        </div>
      </form>

      <aside class="w-full xl:w-[300px] xl:sticky xl:top-4 flex flex-col gap-4" aria-label="Intake progress">
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="Checklist" :level="3" />
          <ul class="flex flex-col gap-2" data-testid="intake-checklist">
            <li v-for="c in checklist" :key="c.label" class="flex items-center gap-2">
              <BulwarkIcon :name="c.done ? 'check-circle' : 'clock'" size="sm" />
              <span>{{ c.label }}</span><span class="sr-only">{{ c.done ? ' done' : ' to do' }}</span>
            </li>
          </ul>
          <p class="bw-help mt-2">Only the address and client are required.</p>
        </BulwarkCard>
        <BulwarkCard padding="md">
          <BulwarkSectionHeader title="What happens next" :level="3" />
          <p class="bw-help">The property joins the pipeline as a lead. Schedule the inspection from its page, or choose Save &amp; add inspection.</p>
        </BulwarkCard>
      </aside>
    </div>

    <div class="xl:hidden fixed bottom-0 inset-x-0 flex gap-2 p-3 border-t" style="background: var(--bg-surface); border-color: var(--border-subtle); z-index: var(--z-sticky, 20)">
      <NuxtLink to="/admin/properties" class="bw-btn bw-btn--secondary flex-1 justify-center min-h-12">Cancel</NuxtLink>
      <BulwarkButton class="flex-1 min-h-12" :loading="saving" data-testid="submit-button-mobile" @click="submit('hub')">Create property</BulwarkButton>
    </div>

    <BulwarkModal :open="!!leaveTo" title="Discard this property?" size="sm" destructive @close="leaveTo = null">
      <p>What you entered here will be lost.</p>
      <template #footer>
        <BulwarkButton variant="secondary" @click="leaveTo = null">Keep editing</BulwarkButton>
        <BulwarkButton variant="destructive" data-testid="discard-confirm" @click="confirmLeave">Discard</BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
