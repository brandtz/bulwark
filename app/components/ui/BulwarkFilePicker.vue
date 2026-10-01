<!--
  BulwarkFilePicker.vue — choose files with a button (Packet A components/SPEC.md, WP-A2).

  A visible button triggers a hidden <input type=file> (SPEC); the chosen
  files are a <ul> with size and a remove button. Files over `maxSize` or of
  a type `accept` does not allow are refused with an inline error and an
  `error` event; accepted ones emit `select`, removals `remove`. Drag-and-drop
  areas use BulwarkDropzone instead.
  `maxSize` is bytes (SPEC); `maxSizeMB` (existing callers) still works.
-->
<script setup lang="ts">
interface Props {
  modelValue: File[]
  label: string
  accept?: string
  multiple?: boolean
  /** Max bytes per file. */
  maxSize?: number
  /** @deprecated use `maxSize` (bytes). */
  maxSizeMB?: number
  required?: boolean
  disabled?: boolean
  buttonLabel?: string
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  accept: undefined,
  multiple: true,
  maxSize: undefined,
  maxSizeMB: 25,
  required: false,
  disabled: false,
  buttonLabel: 'Choose files',
  helper: '',
  hint: '',
  id: undefined,
})
const emit = defineEmits<{
  'update:modelValue': [v: File[]]
  select: [files: File[]]
  remove: [file: File]
  error: [message: string]
}>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `fp-${reactiveId}`)
const input = ref<HTMLInputElement | null>(null)
const localError = ref('')
const helperText = computed(() => props.helper || props.hint)
const limit = computed(() => props.maxSize ?? props.maxSizeMB * 1024 * 1024)

function allowed(f: File): boolean {
  if (!props.accept) return true
  return props.accept.split(',').map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith('.') ? f.name.toLowerCase().endsWith(a)
      : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1))
        : f.type === a)
}

function fail(message: string) {
  localError.value = message
  emit('error', message)
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = '' // the same file can be picked again after a removal
  const wrongType = files.find((f) => !allowed(f))
  if (wrongType) return fail(`${wrongType.name} is not an accepted file type.`)
  const oversize = files.find((f) => f.size > limit.value)
  if (oversize) return fail(`${oversize.name} is larger than ${fmtSize(limit.value)}.`)
  localError.value = ''
  emit('select', files)
  emit('update:modelValue', props.multiple ? [...props.modelValue, ...files] : files)
}

function remove(idx: number) {
  const next = [...props.modelValue]
  const [gone] = next.splice(idx, 1)
  if (gone) emit('remove', gone)
  emit('update:modelValue', next)
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="bw-field">
    <span :id="`${inputId}-label`" class="bw-label">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </span>
    <input
      :id="inputId"
      ref="input"
      type="file"
      class="sr-only"
      tabindex="-1"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      :required="required && modelValue.length === 0"
      :aria-labelledby="`${inputId}-label`"
      @change="onChange"
    >
    <div>
      <button
        type="button"
        class="bw-btn bw-btn--secondary"
        :disabled="disabled"
        :aria-describedby="localError ? `${inputId}-err` : helperText ? `${inputId}-hint` : undefined"
        @click="input?.click()"
      >
        <BulwarkIcon name="upload" size="sm" />{{ buttonLabel }}
      </button>
    </div>
    <ul v-if="modelValue.length" class="flex flex-col gap-1 mt-1">
      <li
        v-for="(f, idx) in modelValue"
        :key="`${f.name}-${idx}`"
        class="flex items-center gap-2 px-3"
        style="min-height: 40px; border-radius: var(--radius-sm); background: var(--bg-sunken); font-size: var(--text-sm)"
      >
        <BulwarkIcon name="file" size="sm" />
        <span class="truncate flex-1">{{ f.name }}</span>
        <span class="bw-help tnum shrink-0">{{ fmtSize(f.size) }}</span>
        <button
          type="button"
          class="bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm"
          :aria-label="`Remove ${f.name}`"
          @click="remove(idx)"
        >
          <BulwarkIcon name="x" size="sm" />
        </button>
      </li>
    </ul>
    <p v-if="localError" :id="`${inputId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ localError }}
    </p>
    <p v-else-if="helperText" :id="`${inputId}-hint`" class="bw-help">{{ helperText }}</p>
  </div>
</template>
