<!--
  app/pages/settings/inspection-templates.vue — W2-2 (EH-F / ADR-0019).

  Admin authoring surface for the inspection template engine. Lists
  templates per program, lets admins add/edit/delete sections + fields,
  and toggle active state. The page intentionally stays simple — no
  drag-and-drop reorder yet (admins use the "Sort order" number input);
  that lands in a follow-up once we have telemetry on how often section
  order is changed in practice.

  # Decisions (ADR-0008)
    - Built-in templates are editable but `isBuiltin` is preserved on
      save so the activate / hide toggle keeps them around even when
      "deleted" by the admin.
    - Field editor opens in a modal (BulwarkModal) keyed by the
      currently-edited field. Cancel discards local edits; Save calls
      `updateField` (or `addField` for new) and re-loads the template.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import type {
  InspectionTemplate,
  InspectionTemplateWithSections,
  InspectionTemplateField,
  InspectionTemplateSection,
} from '~~/shared/contracts/inspection-template'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})
useHead({ title: 'Inspection templates' })

const auth = useService('auth')
const templateService = useService('inspectionTemplate')
const programService = useService('program')

const sessionUser = await auth.currentUser()
if (!sessionUser) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
const organizationId = sessionUser.activeOrganizationId

const programs = ref<{ id: string; name: string; slug: string }[]>([])
const templates = ref<InspectionTemplate[]>([])
const activeTemplate = ref<InspectionTemplateWithSections | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function loadList(): Promise<void> {
  loading.value = true
  try {
    const [pList, tList] = await Promise.all([
      programService.list({ organizationId, page: 1, pageSize: 50 }),
      templateService.list({ organizationId, page: 1, pageSize: 100, includeInactive: true }),
    ])
    programs.value = pList.rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
    templates.value = tList.rows
  } finally {
    loading.value = false
  }
}
await loadList()

async function openTemplate(t: InspectionTemplate): Promise<void> {
  const full = await templateService.getWithSections(t.id, organizationId)
  activeTemplate.value = full
}

function programName(id: string | null): string {
  if (!id) return '—'
  return programs.value.find((p) => p.id === id)?.name ?? '—'
}

// --- Section + field editing -------------------------------------------
const newSectionName = ref('')
async function addSection(): Promise<void> {
  if (!activeTemplate.value || !newSectionName.value.trim()) return
  const slug = newSectionName.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  try {
    await templateService.addSection({
      organizationId,
      templateId: activeTemplate.value.id,
      slug,
      name: newSectionName.value,
      sortOrder: activeTemplate.value.sections.length,
    })
    newSectionName.value = ''
    await openTemplate(activeTemplate.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Add failed'
  }
}

async function removeSection(s: InspectionTemplateSection): Promise<void> {
  if (!activeTemplate.value) return
  if (!confirm(`Delete section "${s.name}" and its fields?`)) return
  await templateService.deleteSection({ organizationId, sectionId: s.id })
  await openTemplate(activeTemplate.value)
}

const editingField = ref<{ section: InspectionTemplateSection; field: InspectionTemplateField | null } | null>(null)
const fieldDraft = ref<{
  slug: string
  label: string
  kind: InspectionTemplateField['kind']
  required: boolean
  helpText: string
  optionsText: string
}>({ slug: '', label: '', kind: 'text', required: false, helpText: '', optionsText: '' })

function startEditField(section: InspectionTemplateSection, field: InspectionTemplateField | null): void {
  editingField.value = { section, field }
  if (field) {
    fieldDraft.value = {
      slug: field.slug,
      label: field.label,
      kind: field.kind,
      required: field.required,
      helpText: field.helpText ?? '',
      optionsText: field.options ? field.options.map((o) => `${o.value}|${o.label}`).join('\n') : '',
    }
  } else {
    fieldDraft.value = { slug: '', label: '', kind: 'text', required: false, helpText: '', optionsText: '' }
  }
}

function parseOptions(text: string): { value: string; label: string }[] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return lines.map((l) => {
    const [value, ...rest] = l.split('|')
    return { value: (value ?? '').trim(), label: rest.join('|').trim() || (value ?? '').trim() }
  })
}

async function saveField(): Promise<void> {
  if (!editingField.value || !activeTemplate.value) return
  const { section, field } = editingField.value
  const payload = {
    slug: fieldDraft.value.slug,
    label: fieldDraft.value.label,
    kind: fieldDraft.value.kind,
    required: fieldDraft.value.required,
    helpText: fieldDraft.value.helpText || null,
    options:
      fieldDraft.value.kind === 'select' || fieldDraft.value.kind === 'multiselect'
        ? parseOptions(fieldDraft.value.optionsText)
        : null,
  }
  try {
    if (field) {
      await templateService.updateField({ organizationId, fieldId: field.id, ...payload })
    } else {
      await templateService.addField({ organizationId, sectionId: section.id, ...payload })
    }
    editingField.value = null
    await openTemplate(activeTemplate.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Save failed'
  }
}

async function removeField(f: InspectionTemplateField): Promise<void> {
  if (!activeTemplate.value) return
  if (!confirm(`Delete field "${f.label}"?`)) return
  await templateService.deleteField({ organizationId, fieldId: f.id })
  await openTemplate(activeTemplate.value)
}

async function toggleActive(t: InspectionTemplate): Promise<void> {
  await templateService.activate({ organizationId, templateId: t.id, isActive: !t.isActive })
  await loadList()
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto" data-testid="settings-inspection-templates">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Settings', to: '/settings' },
        { label: 'Inspection templates' },
      ]"
    />
    <h1 class="text-display mt-2">Inspection templates</h1>
    <p class="text-body text-text-secondary mt-1">
      Author the field-capture forms used by each program.
    </p>

    <BulwarkSkeleton v-if="loading" class="mt-6 h-32" />
    <div v-else class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <BulwarkCard class="lg:col-span-1">
        <h2 class="text-md font-semibold mb-2">Templates</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="t in templates" :key="t.id">
            <button
              type="button"
              class="w-full text-left rounded-input border border-border p-2 hover:bg-surface-muted"
              :class="activeTemplate?.id === t.id && 'border-brand'"
              :data-testid="`template-row-${t.slug}`"
              @click="openTemplate(t)"
            >
              <p class="text-body font-medium">{{ t.name }}</p>
              <p class="text-small text-text-secondary">
                {{ programName(t.programId) }} ·
                {{ t.isActive ? 'Active' : 'Inactive' }}
                <span v-if="t.isBuiltin" class="ml-1">(built-in)</span>
              </p>
            </button>
          </li>
        </ul>
      </BulwarkCard>

      <BulwarkCard v-if="activeTemplate" class="lg:col-span-2" data-testid="template-editor">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-md font-semibold">{{ activeTemplate.name }}</h2>
            <p class="text-small text-text-secondary">v{{ activeTemplate.version }}</p>
          </div>
          <BulwarkButton variant="ghost" size="sm" @click="toggleActive(activeTemplate)">
            {{ activeTemplate.isActive ? 'Deactivate' : 'Activate' }}
          </BulwarkButton>
        </div>

        <div class="mt-4 flex flex-col gap-4">
          <div v-for="section in activeTemplate.sections" :key="section.id" class="border-t border-border pt-3">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">{{ section.name }}</h3>
              <button class="text-small text-status-error" @click="removeSection(section)">Delete section</button>
            </div>
            <ul class="mt-2 flex flex-col gap-1">
              <li
                v-for="field in section.fields"
                :key="field.id"
                class="flex items-center justify-between gap-2 text-small"
                :data-testid="`template-field-${field.slug}`"
              >
                <span>
                  <strong class="font-medium">{{ field.label }}</strong>
                  <span class="text-text-secondary"> · {{ field.kind }}</span>
                  <span v-if="field.required" class="text-status-error"> *</span>
                </span>
                <span class="flex gap-2">
                  <button class="text-brand underline" @click="startEditField(section, field)">Edit</button>
                  <button class="text-status-error" @click="removeField(field)">Delete</button>
                </span>
              </li>
            </ul>
            <BulwarkButton
              variant="ghost"
              size="sm"
              class="mt-2"
              :data-testid="`add-field-${section.slug}`"
              @click="startEditField(section, null)"
            >+ Add field</BulwarkButton>
          </div>

          <div class="border-t border-border pt-3 flex items-end gap-2">
            <BulwarkInput
              v-model="newSectionName"
              label="New section name"
              placeholder="e.g. Roof"
            />
            <BulwarkButton variant="primary" :disabled="!newSectionName.trim()" @click="addSection">
              Add section
            </BulwarkButton>
          </div>
        </div>
      </BulwarkCard>
    </div>

    <BulwarkModal
      :model-value="editingField !== null"
      title="Field"
      size="md"
      @update:model-value="(v) => !v && (editingField = null)"
    >
      <div class="flex flex-col gap-3">
        <BulwarkInput v-model="fieldDraft.slug" label="Slug" required />
        <BulwarkInput v-model="fieldDraft.label" label="Label" required />
        <BulwarkSelect
          v-model="fieldDraft.kind"
          label="Kind"
          :options="[
            { value: 'text', label: 'Text' },
            { value: 'longtext', label: 'Long text' },
            { value: 'number', label: 'Number' },
            { value: 'currency', label: 'Currency' },
            { value: 'boolean', label: 'Boolean' },
            { value: 'select', label: 'Select' },
            { value: 'multiselect', label: 'Multi-select' },
            { value: 'date', label: 'Date' },
            { value: 'photo', label: 'Photo' },
            { value: 'signature', label: 'Signature' },
            { value: 'passfail', label: 'Pass/fail' },
            { value: 'rating', label: 'Rating (1–5)' },
          ]"
        />
        <BulwarkToggle v-model="fieldDraft.required" label="Required" />
        <BulwarkInput v-model="fieldDraft.helpText" label="Help text" />
        <BulwarkTextarea
          v-if="fieldDraft.kind === 'select' || fieldDraft.kind === 'multiselect'"
          v-model="fieldDraft.optionsText"
          label="Options (one per line, value|label)"
          :rows="4"
        />
      </div>
      <template #footer>
        <BulwarkButton variant="ghost" @click="editingField = null">Cancel</BulwarkButton>
        <BulwarkButton
          variant="primary"
          :disabled="!fieldDraft.slug || !fieldDraft.label"
          data-testid="save-field"
          @click="saveField"
        >Save</BulwarkButton>
      </template>
    </BulwarkModal>

    <p v-if="error" class="mt-3 text-small text-status-error">{{ error }}</p>
  </div>
</template>
