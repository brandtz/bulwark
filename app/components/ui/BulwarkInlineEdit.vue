<!--
  BulwarkInlineEdit.vue — click-to-edit value (Packet A components/SPEC.md, WP-A3).

  View state is a button ("Edit <label>"). Editing: Enter saves (saveOn
  enter|both), blur saves (blur|both), Esc cancels and restores; focus returns
  to the view button. Emits save(value) and cancel; the caller persists and
  can pass `error` back to keep it open.
-->
<script setup lang="ts">
interface Props {
  modelValue: string | number | null
  label: string
  type?: 'text' | 'number' | 'email' | 'tel' | 'date'
  saveOn?: 'blur' | 'enter' | 'both'
  error?: string
  placeholder?: string
}
const props = withDefaults(defineProps<Props>(), { type: 'text', saveOn: 'both', error: '', placeholder: 'Add…' })
const emit = defineEmits<{ save: [value: string], cancel: [] }>()

const editing = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
const view = ref<HTMLButtonElement | null>(null)
let skipBlur = false

async function start() {
  draft.value = props.modelValue === null ? '' : String(props.modelValue)
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
function finish(save: boolean) {
  if (save && draft.value !== (props.modelValue === null ? '' : String(props.modelValue))) emit('save', draft.value)
  else if (!save) emit('cancel')
  editing.value = false
  nextTick(() => view.value?.focus())
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); skipBlur = true; finish(false) }
  else if (e.key === 'Enter' && props.saveOn !== 'blur') { e.preventDefault(); skipBlur = true; finish(true) }
}
function onBlur() {
  if (skipBlur) { skipBlur = false; return }
  if (props.saveOn !== 'enter') finish(true)
  else finish(false)
}
watch(() => props.error, (e) => { if (e) start() })
</script>

<template>
  <span class="inline-flex flex-col">
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      :type="type"
      class="bw-input"
      :class="error && 'is-error'"
      style="height: var(--control-h-sm)"
      :aria-label="label"
      :aria-invalid="!!error"
      @keydown="onKey"
      @blur="onBlur"
    >
    <button
      v-else
      ref="view"
      type="button"
      class="inline-flex items-center gap-1 text-left rounded hover:bg-[var(--bg-hover)] px-1 -mx-1"
      :aria-label="`Edit ${label}`"
      @click="start"
    >
      <span :style="modelValue === null || modelValue === '' ? 'color: var(--text-muted)' : undefined">{{ modelValue === null || modelValue === '' ? placeholder : modelValue }}</span>
      <BulwarkIcon name="pencil" size="sm" style="color: var(--text-muted)" />
    </button>
    <span v-if="error" class="bw-error" role="alert">{{ error }}</span>
  </span>
</template>
