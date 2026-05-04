<!--
  BulwarkFilePicker.vue — multi-file picker with size/type validation.

  Why this component exists
  -------------------------
  Property assessments need photos. Compliance generator needs PDFs.
  Subcontractor onboarding needs license docs. Centralizing means: same
  drag-drop affordance, same size limit messaging, same file list.

  Decisions
  ---------
  - **No upload logic here**: this primitive only manages local File[]
    selection. Upload happens at form-submit via a future
    `useFileUpload()` composable. (Considered: integrated upload-on-pick;
    rejected — it tightly couples this primitive to backend specifics.)
-->
<script setup lang="ts">
interface Props {
  modelValue: File[]
  label: string
  accept?: string
  multiple?: boolean
  /** Max size per file in MB. Files larger are rejected with an inline error. */
  maxSizeMB?: number
  required?: boolean
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  accept: undefined,
  multiple: true,
  maxSizeMB: 25,
  required: false,
  hint: '',
  id: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [v: File[]] }>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `fp-${reactiveId}`)
const localError = ref('')

function onChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  const limit = props.maxSizeMB * 1024 * 1024
  const oversize = files.find((f) => f.size > limit)
  if (oversize) {
    localError.value = `${oversize.name} exceeds the ${props.maxSizeMB}MB limit.`
    return
  }
  localError.value = ''
  emit('update:modelValue', props.multiple ? [...props.modelValue, ...files] : files)
}

function remove(idx: number) {
  const next = [...props.modelValue]
  next.splice(idx, 1)
  emit('update:modelValue', next)
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-small font-medium text-text-primary">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </label>
    <input
      :id="inputId"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :required="required && modelValue.length === 0"
      class="block w-full text-small file:mr-3 file:h-9 file:rounded-input file:border-0 file:bg-primary file:px-4 file:text-white file:cursor-pointer hover:file:bg-primary-700"
      @change="onChange"
    />
    <ul v-if="modelValue.length" class="mt-2 flex flex-col gap-1">
      <li
        v-for="(f, idx) in modelValue"
        :key="`${f.name}-${idx}`"
        class="flex items-center justify-between gap-2 px-3 py-1.5 rounded-input bg-surface-muted text-small"
      >
        <span class="truncate">{{ f.name }}</span>
        <span class="text-text-secondary shrink-0">{{ fmtSize(f.size) }}</span>
        <button
          type="button"
          class="text-text-secondary hover:text-status-error shrink-0"
          :aria-label="`Remove ${f.name}`"
          @click="remove(idx)"
        >×</button>
      </li>
    </ul>
    <p v-if="localError" class="text-small text-status-error" role="alert">{{ localError }}</p>
    <p v-else-if="hint" class="text-small text-text-secondary">{{ hint }}</p>
  </div>
</template>
