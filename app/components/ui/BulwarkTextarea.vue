<!--
  BulwarkTextarea.vue — multi-line text (Packet A components/SPEC.md, WP-A2).

  Same field anatomy and accessibility as BulwarkInput (label, helper, error
  with icon, aria-describedby). `autogrow` (default on) grows the box with its
  content between `rows` and `maxRows`, then scrolls; turn it off inside
  virtualized tables (SPEC). `maxlength` shows a live count.
-->
<script setup lang="ts">
interface Props {
  modelValue: string | null | undefined
  label: string
  placeholder?: string
  error?: string
  required?: boolean
  readonly?: boolean
  disabled?: boolean
  rows?: number
  autogrow?: boolean
  maxRows?: number
  maxlength?: number
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  error: '',
  helper: '',
  hint: '',
  required: false,
  readonly: false,
  disabled: false,
  rows: 3,
  autogrow: true,
  maxRows: 8,
  maxlength: undefined,
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
}>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `txa-${reactiveId}`)
const helperText = computed(() => props.helper || props.hint)
const describedById = computed(() => {
  const ids: string[] = []
  if (props.error) ids.push(`${inputId.value}-err`)
  else if (helperText.value) ids.push(`${inputId.value}-hint`)
  if (props.maxlength) ids.push(`${inputId.value}-count`)
  return ids.join(' ') || undefined
})

const el = ref<HTMLTextAreaElement | null>(null)

function resize() {
  const t = el.value
  if (!t || !props.autogrow) return
  const style = getComputedStyle(t)
  const line = Number.parseFloat(style.lineHeight) || 20
  const chrome = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
  t.style.height = 'auto'
  const max = line * props.maxRows + chrome
  t.style.height = `${Math.min(t.scrollHeight, max)}px`
  t.style.overflowY = t.scrollHeight > max ? 'auto' : 'hidden'
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  resize()
}

onMounted(resize)
watch(() => props.modelValue, () => nextTick(resize))
</script>

<template>
  <div class="bw-field">
    <label :for="inputId" class="bw-label">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>
    <textarea
      :id="inputId"
      ref="el"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :rows="rows"
      :maxlength="maxlength"
      :aria-invalid="!!error"
      :aria-describedby="describedById"
      class="bw-input bw-textarea"
      :class="{ 'is-error': !!error }"
      :style="autogrow ? 'resize: none' : undefined"
      @input="onInput"
      @blur="emit('blur', $event)"
    />
    <p v-if="error" :id="`${inputId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ error }}
    </p>
    <p v-else-if="helperText" :id="`${inputId}-hint`" class="bw-help">{{ helperText }}</p>
    <p v-if="maxlength" :id="`${inputId}-count`" class="bw-help text-right tnum" aria-live="polite">
      {{ String(modelValue ?? '').length }} / {{ maxlength }}
    </p>
  </div>
</template>
