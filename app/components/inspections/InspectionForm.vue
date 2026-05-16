<!--
  InspectionForm.vue — dynamic field-capture form (W2-2 / EH-F / ADR-0019).

  # Decisions (ADR-0008, ADR-0019)
    - **Template-as-data**: We hydrate the active inspection + its
      template (sections + fields) from the services, then render each
      field by `kind`. No per-program code path, no per-template
      conditional rendering — adding a new field kind in `wildfire-
      defaults.ts` shows up here automatically because we delegate to a
      `<component :is="...">` switch keyed on `field.kind`.

    - **Repeatable sections** (`isRepeatable=true`): an "instances" array
      backs the in-form add/remove UX. Instance keys follow the format
      `<sectionSlug>-<n>` (e.g. `deck-1`, `deck-2`). The first instance is
      always `<sectionSlug>-1` for parity with non-repeatable rendering.
      Responses already on file determine the initial instance count.

    - **Conditional visibility**: Sections and fields can declare
      `conditionalOnFieldSlug` + `conditionalOnValue`. We resolve the
      predicate using the current response set. Hidden inputs are
      *not* unmounted (we keep their model so re-showing restores their
      value) but they're skipped during save.

    - **Auto-save**: We debounce 800 ms after the last change, then call
      `inspectionService.saveResponses` with the diff. Optimistic — the
      UI keeps the user-typed value even if the round-trip is slow. We
      flush on unmount so navigating away doesn't drop work.

    - **Submit + sign**: The "Submit & sign" CTA opens a modal with the
      `SignaturePad`. On confirm we call `sign({ signedByName,
      signatureDataUrl })` which moves the inspection straight to
      `signed`. (We *could* split submit vs. sign but the field crew has
      asked for one tap; the audit trail captures both transitions.)

  # Decision cast down
    - Rejected: building a separate dedicated "review issues" sub-page
      after submit. The post-sign success state inline-renders the
      evaluator output so the crew sees the consequence of their answers
      right away — this is the single biggest demo affordance.
-->
<script setup lang="ts">
import type {
  InspectionWithResponses,
  InspectionIssue,
} from '~~/shared/contracts/inspection'
import type {
  InspectionTemplateWithSections,
  InspectionTemplateSection,
  InspectionTemplateField,
} from '~~/shared/contracts/inspection-template'

interface Props {
  inspectionId: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ signed: [{ inspectionId: string }] }>()

const inspectionService = useService('inspection')
const templateService = useService('inspectionTemplate')
const { session, ensureLoaded } = useSession()
const { t } = useLabel()
await ensureLoaded()
if (!session.value) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
const organizationId = session.value.activeOrganizationId

const inspection = ref<InspectionWithResponses | null>(null)
const template = ref<InspectionTemplateWithSections | null>(null)
const issues = ref<InspectionIssue[]>([])
const loading = ref(true)
const saving = ref(false)
const saveError = ref<string | null>(null)
const showSign = ref(false)
const signedByName = ref(session.value.fullName ?? '')
const signatureUrl = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)

/** `responses[sectionInstanceKey][fieldSlug] = value`. */
const responses = ref<Record<string, Record<string, unknown>>>({})

/** Instances per repeatable section, keyed by section.slug. */
const instances = ref<Record<string, string[]>>({})

async function load(): Promise<void> {
  loading.value = true
  try {
    const insp = await inspectionService.getWithResponses(props.inspectionId, organizationId)
    if (!insp) throw createError({ statusCode: 404, statusMessage: 'Inspection not found' })
    inspection.value = insp
    const tpl = await templateService.getWithSections(insp.templateId, organizationId)
    if (!tpl) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    template.value = tpl

    // Hydrate `responses` map from server state.
    const initial: Record<string, Record<string, unknown>> = {}
    for (const r of insp.responses) {
      const bucket = initial[r.sectionInstanceKey] ?? {}
      bucket[r.fieldSlug] = r.valueJson
      initial[r.sectionInstanceKey] = bucket
    }
    responses.value = initial

    // Compute initial instances per section. Non-repeatable: always one
    // key `${slug}-1`. Repeatable: derive from existing response keys, or
    // default to one fresh instance.
    const ins: Record<string, string[]> = {}
    for (const s of tpl.sections) {
      if (s.isRepeatable) {
        const matchingKeys = Object.keys(initial).filter((k) => k.startsWith(`${s.slug}-`))
        ins[s.slug] = matchingKeys.length > 0
          ? matchingKeys.sort()
          : [`${s.slug}-1`]
      } else {
        ins[s.slug] = [`${s.slug}-1`]
      }
    }
    instances.value = ins
  } finally {
    loading.value = false
  }
}
await load()

function isFieldVisible(
  instanceKey: string,
  field: InspectionTemplateField,
): boolean {
  if (!field.conditionalOnFieldSlug) return true
  const bucket = responses.value[instanceKey] ?? {}
  const actual = bucket[field.conditionalOnFieldSlug]
  return String(actual ?? '') === String(field.conditionalOnValue ?? '')
}

function isSectionVisible(section: InspectionTemplateSection): boolean {
  if (!section.conditionalOnFieldSlug) return true
  // Walk every section/instance/field, find the gating field's value.
  for (const s of template.value?.sections ?? []) {
    for (const f of s.fields) {
      if (f.slug !== section.conditionalOnFieldSlug) continue
      for (const k of instances.value[s.slug] ?? []) {
        const v = responses.value[k]?.[f.slug]
        if (v != null) return String(v) === String(section.conditionalOnValue ?? '')
      }
    }
  }
  return false
}

function setValue(instanceKey: string, fieldSlug: string, value: unknown): void {
  const bucket = { ...(responses.value[instanceKey] ?? {}), [fieldSlug]: value }
  responses.value = { ...responses.value, [instanceKey]: bucket }
  scheduleAutoSave()
}

function addInstance(section: InspectionTemplateSection): void {
  const current = instances.value[section.slug] ?? []
  const next = `${section.slug}-${current.length + 1}`
  instances.value = { ...instances.value, [section.slug]: [...current, next] }
}

function removeInstance(section: InspectionTemplateSection, key: string): void {
  const current = instances.value[section.slug] ?? []
  if (current.length <= 1) return
  const next = current.filter((k) => k !== key)
  instances.value = { ...instances.value, [section.slug]: next }
  const r = { ...responses.value }
  delete r[key]
  responses.value = r
  scheduleAutoSave()
}

// --- Auto-save -----------------------------------------------------------
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => { void flushSave() }, 800)
}

async function flushSave(): Promise<void> {
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  if (!inspection.value || !template.value) return
  if (inspection.value.status !== 'draft') return
  saving.value = true
  saveError.value = null
  try {
    const payload: { sectionInstanceKey: string; fieldSlug: string; valueJson: unknown }[] = []
    for (const section of template.value.sections) {
      for (const key of instances.value[section.slug] ?? []) {
        for (const field of section.fields) {
          if (!isFieldVisible(key, field)) continue
          const v = responses.value[key]?.[field.slug]
          if (v === undefined) continue
          payload.push({ sectionInstanceKey: key, fieldSlug: field.slug, valueJson: v })
        }
      }
    }
    await inspectionService.saveResponses({
      organizationId,
      inspectionId: props.inspectionId,
      responses: payload,
    })
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => { void flushSave() })

// --- Submit + sign -------------------------------------------------------
async function onSubmitAndSign(): Promise<void> {
  submitError.value = null
  if (!signatureUrl.value) {
    submitError.value = 'Signature required'
    return
  }
  submitting.value = true
  try {
    await flushSave()
    await inspectionService.sign({
      organizationId,
      inspectionId: props.inspectionId,
      signedByName: signedByName.value,
      signatureDataUrl: signatureUrl.value,
    })
    const result = await inspectionService.evaluate({
      organizationId,
      inspectionId: props.inspectionId,
    })
    issues.value = result.issues
    await load()
    showSign.value = false
    emit('signed', { inspectionId: props.inspectionId })
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Submit failed'
  } finally {
    submitting.value = false
  }
}

const statusLabel = computed(() => {
  const s = inspection.value?.status ?? 'draft'
  return t('status.inspection', s, s.charAt(0).toUpperCase() + s.slice(1))
})

const issueSeverityClass = (sev: string) =>
  sev === 'error' ? 'text-status-error' : 'text-status-warning'

defineExpose({ flushSave })
</script>

<template>
  <div data-testid="inspection-form" class="flex flex-col gap-4">
    <BulwarkCard>
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold">{{ template?.name }}</h2>
          <p class="text-small text-text-secondary">
            v{{ inspection?.templateVersion }} · {{ statusLabel }}
          </p>
        </div>
        <div class="text-small text-text-secondary" data-testid="save-status">
          <span v-if="saving">Saving…</span>
          <span v-else-if="saveError" class="text-status-error">{{ saveError }}</span>
          <span v-else>All changes saved</span>
        </div>
      </div>
    </BulwarkCard>

    <template v-for="section in template?.sections ?? []" :key="section.id">
      <BulwarkCard v-if="isSectionVisible(section)">
        <div class="flex items-baseline justify-between mb-3">
          <div>
            <h3 class="text-md font-semibold">{{ section.name }}</h3>
            <p v-if="section.description" class="text-small text-text-secondary">{{ section.description }}</p>
          </div>
          <BulwarkButton
            v-if="section.isRepeatable && inspection?.status === 'draft'"
            variant="ghost"
            size="sm"
            data-testid="add-instance"
            @click="addInstance(section)"
          >
            + Add another {{ section.repeatableLabel ?? 'instance' }}
          </BulwarkButton>
        </div>

        <div
          v-for="(instanceKey, idx) in instances[section.slug] ?? []"
          :key="instanceKey"
          class="flex flex-col gap-3 py-3"
          :class="idx > 0 && 'border-t border-border'"
        >
          <div v-if="section.isRepeatable" class="flex items-center justify-between">
            <span class="text-small font-medium">
              {{ section.repeatableLabel ?? section.slug }} #{{ idx + 1 }}
            </span>
            <button
              v-if="(instances[section.slug] ?? []).length > 1 && inspection?.status === 'draft'"
              type="button"
              class="text-small text-status-error"
              @click="removeInstance(section, instanceKey)"
            >Remove</button>
          </div>

          <template v-for="field in section.fields" :key="field.id">
            <div v-if="isFieldVisible(instanceKey, field)" :data-testid="`field-${field.slug}`">
              <!-- text / longtext / number -->
              <BulwarkInput
                v-if="field.kind === 'text'"
                :model-value="(responses[instanceKey]?.[field.slug] as string) ?? ''"
                :label="field.label"
                :required="field.required"
                :hint="field.helpText ?? ''"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkTextarea
                v-else-if="field.kind === 'longtext'"
                :model-value="(responses[instanceKey]?.[field.slug] as string) ?? ''"
                :label="field.label"
                :required="field.required"
                :hint="field.helpText ?? ''"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkInput
                v-else-if="field.kind === 'number' || field.kind === 'currency'"
                type="number"
                :model-value="(responses[instanceKey]?.[field.slug] as number | null) ?? null"
                :label="field.label"
                :required="field.required"
                :hint="field.helpText ?? ''"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v === '' ? null : Number(v))"
              />
              <BulwarkToggle
                v-else-if="field.kind === 'boolean'"
                :model-value="Boolean(responses[instanceKey]?.[field.slug])"
                :label="field.label"
                :description="field.helpText ?? ''"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkSelect
                v-else-if="field.kind === 'select'"
                :model-value="(responses[instanceKey]?.[field.slug] as string | null) ?? null"
                :label="field.label"
                :required="field.required"
                :options="field.options ?? []"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkMultiSelect
                v-else-if="field.kind === 'multiselect'"
                :model-value="(responses[instanceKey]?.[field.slug] as string[]) ?? []"
                :label="field.label"
                :required="field.required"
                :options="field.options ?? []"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkDatePicker
                v-else-if="field.kind === 'date'"
                :model-value="(responses[instanceKey]?.[field.slug] as string | null) ?? null"
                :label="field.label"
                :required="field.required"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <BulwarkFilePicker
                v-else-if="field.kind === 'photo'"
                :model-value="[]"
                :label="field.label"
                :required="field.required"
                accept="image/*"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v.map((f) => ({ name: f.name, size: f.size })))"
              />
              <BulwarkPassFailToggle
                v-else-if="field.kind === 'passfail'"
                :model-value="(responses[instanceKey]?.[field.slug] as 'pass' | 'fail' | 'na' | null) ?? null"
                :label="field.label"
                :description="field.helpText ?? ''"
                :disabled="inspection?.status !== 'draft'"
                @update:model-value="(v) => setValue(instanceKey, field.slug, v)"
              />
              <div v-else-if="field.kind === 'rating'" class="flex flex-col gap-1">
                <span class="text-small font-medium">{{ field.label }}</span>
                <BulwarkSegmentedControl
                  :model-value="String(responses[instanceKey]?.[field.slug] ?? '')"
                  :aria-label="field.label"
                  :options="[
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                    { value: '5', label: '5' },
                  ]"
                  @update:model-value="(v) => setValue(instanceKey, field.slug, Number(v))"
                />
              </div>
              <div v-else class="text-small text-status-error">
                Unsupported field kind: {{ field.kind }}
              </div>
            </div>
          </template>
        </div>
      </BulwarkCard>
    </template>

    <BulwarkCard v-if="issues.length > 0" data-testid="inspection-issues">
      <h3 class="text-md font-semibold mb-2">Evaluator findings</h3>
      <ul class="flex flex-col gap-1">
        <li
          v-for="issue in issues"
          :key="`${issue.sectionInstanceKey}::${issue.fieldSlug}::${issue.message}`"
          :class="issueSeverityClass(issue.severity)"
          class="text-small"
        >
          <strong class="font-semibold">{{ issue.severity.toUpperCase() }}</strong>
          · {{ issue.fieldSlug }} — {{ issue.message }}
        </li>
      </ul>
    </BulwarkCard>

    <div class="flex justify-end gap-2">
      <BulwarkButton
        v-if="inspection?.status === 'draft'"
        variant="primary"
        data-testid="submit-and-sign"
        @click="showSign = true"
      >Submit &amp; sign</BulwarkButton>
      <span v-else class="text-small text-text-secondary self-center">
        {{ statusLabel }}
      </span>
    </div>

    <BulwarkModal v-model="showSign" title="Sign &amp; submit inspection" size="md">
      <div class="flex flex-col gap-3">
        <BulwarkInput
          v-model="signedByName"
          label="Signer name"
          required
          :error="!signedByName ? 'Required' : ''"
        />
        <div class="flex flex-col gap-1">
          <span class="text-small font-medium">Signature</span>
          <SignaturePad v-model="signatureUrl" />
        </div>
        <p v-if="submitError" class="text-small text-status-error">{{ submitError }}</p>
      </div>
      <template #footer>
        <BulwarkButton variant="ghost" @click="showSign = false">Cancel</BulwarkButton>
        <BulwarkButton
          variant="primary"
          :disabled="submitting || !signatureUrl || !signedByName"
          data-testid="confirm-sign"
          @click="onSubmitAndSign"
        >Sign</BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
