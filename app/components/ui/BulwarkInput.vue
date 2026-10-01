<!--
  BulwarkInput.vue — text input primitive (Packet A components/SPEC.md, WP-A2).

  Every form input looks and behaves the same: one height per density
  (`--control-h`), one focus ring, one error treatment, label above. A bare
  <input> in feature code drifts, so use this.

  Decisions:
    - v-model via modelValue / update:modelValue. Validate on blur (SPEC), so
      `blur` is emitted for the caller's validator; nothing validates per key.
    - `error` is the message itself; empty = no error. It is announced
      (role=alert), referenced by aria-describedby, and carries an icon so it
      is not colour-only.
    - SPEC types: currency ($ prefix), percent (% suffix) and measurement
      (`unit` suffix) render a text input with inputmode=decimal and tabular
      numerals; the value stays a string for the caller to parse.
    - `helper` is the SPEC name; `hint` (existing callers) still works.
    - `reveal` adds a Show/Hide toggle to a password (opt-in: login renders its
      own); maxlength shows a live count.
    - Attributes (data-testid ...) land on the root, so `[data-testid=x] input`
      keeps working for existing specs.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type InputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'password'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'currency'
  | 'percent'
  | 'measurement'

interface BulwarkInputProps {
  modelValue: string | number | null | undefined
  label: string
  placeholder?: string
  error?: string
  required?: boolean
  readonly?: boolean
  type?: InputType
  disabled?: boolean
  /** Helper text shown below the input when there is no error (SPEC name). */
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  /** Suffix for `measurement` (e.g. "sq ft"). */
  unit?: string
  /** Shows a live character count. */
  maxlength?: number
  /** Leading icon. */
  icon?: IconName
  /** Password only: adds a Show/Hide toggle. */
  reveal?: boolean
  /** Optional id; auto-generated otherwise so label htmlFor wires up. */
  id?: string
  /** autocomplete passthrough — important for password managers. */
  autocomplete?: string
  /** inputmode passthrough — important for tel/numeric keypads on mobile. */
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url'
}

const props = withDefaults(defineProps<BulwarkInputProps>(), {
  type: 'text',
  required: false,
  readonly: false,
  disabled: false,
  placeholder: '',
  error: '',
  helper: '',
  hint: '',
  unit: undefined,
  maxlength: undefined,
  icon: undefined,
  reveal: false,
  autocomplete: undefined,
  inputmode: undefined,
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
}>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `inp-${reactiveId}`)
const helperText = computed(() => props.helper || props.hint)

const numeric = computed(() => props.type === 'currency' || props.type === 'percent' || props.type === 'measurement')
const revealed = ref(false)
const nativeType = computed(() => {
  if (numeric.value) return 'text'
  if (props.type === 'password' && revealed.value) return 'text'
  return props.type
})
const prefix = computed(() => (props.type === 'currency' ? '$' : null))
const suffix = computed(() => (props.type === 'percent' ? '%' : props.type === 'measurement' ? props.unit ?? null : null))
const count = computed(() => String(props.modelValue ?? '').length)

const describedById = computed(() => {
  const ids: string[] = []
  if (props.error) ids.push(`${inputId.value}-err`)
  else if (helperText.value) ids.push(`${inputId.value}-hint`)
  if (props.maxlength) ids.push(`${inputId.value}-count`)
  return ids.join(' ') || undefined
})

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="bw-field">
    <label :for="inputId" class="bw-label">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>

    <div
      class="bw-inputwrap"
      :class="{
        'no-icon': !icon && !prefix,
        'has-prefix': !!prefix,
        'has-suffix': !!suffix || (type === 'password' && reveal),
      }"
    >
      <BulwarkIcon v-if="icon" :name="icon" size="sm" />
      <span v-else-if="prefix" class="prefix" aria-hidden="true">{{ prefix }}</span>
      <input
        :id="inputId"
        :type="nativeType"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
        :inputmode="inputmode ?? (numeric ? 'decimal' : undefined)"
        :aria-invalid="!!error"
        :aria-describedby="describedById"
        class="bw-input"
        :class="{ 'is-error': !!error, tnum: numeric }"
        @input="onInput"
        @blur="emit('blur', $event)"
      >
      <span v-if="suffix" class="suffix" aria-hidden="true">{{ suffix }}</span>
      <button
        v-else-if="type === 'password' && reveal"
        type="button"
        class="bw-btn bw-btn--link bw-btn--sm suffix"
        :aria-pressed="revealed"
        :aria-controls="inputId"
        @click="revealed = !revealed"
      >
        {{ revealed ? 'Hide' : 'Show' }}
      </button>
    </div>

    <p v-if="error" :id="`${inputId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ error }}
    </p>
    <p v-else-if="helperText" :id="`${inputId}-hint`" class="bw-help">
      {{ helperText }}
    </p>
    <p v-if="maxlength" :id="`${inputId}-count`" class="bw-help text-right tnum" aria-live="polite">
      {{ count }} / {{ maxlength }}
    </p>
  </div>
</template>
