<!--
  BulwarkInput.vue — text input primitive.

  Why this component exists
  -------------------------
  Every form input in Bulwark must look and behave the same: same height
  (h-input = 48px from STYLE_GUIDE §6.2), same focus ring, same error
  treatment, same label position. A bare `<input>` is forbidden in
  feature code because the demo proved each developer rebuilds inputs
  slightly differently and the field UI drifts.

  Design decisions
  ----------------
  - **v-model via `modelValue`/`update:modelValue`**: standard Vue 3 pattern
    so this works inline with `v-model="form.email"`.
  - **Error string slot, not Boolean**: callers pass the actual error message
    (from Zod or server) instead of a boolean. Empty string = no error.
  - **No password-strength meter**: out of scope; intake is a real product
    decision. (Considered: bundling with an icon, rejected — keep primitive
    primitive; password strength lives in a separate component if needed.)
  - **Min height respected on mobile**: meets the 44px tap target
    requirement from BULWARK_STYLE_GUIDE §6 / Apple HIG.
-->
<script setup lang="ts">
/**
 * Public surface (UI-CONTRACTS.md):
 *   props: modelValue, label, placeholder?, error?, required?, type, disabled?
 *   emits: update:modelValue, blur
 */
type InputType = 'text' | 'email' | 'tel' | 'password' | 'number' | 'date'

interface BulwarkInputProps {
  modelValue: string | number | null | undefined
  label: string
  placeholder?: string
  error?: string
  required?: boolean
  type?: InputType
  disabled?: boolean
  /** Optional helper text shown below input when no error. */
  hint?: string
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
  disabled: false,
  placeholder: '',
  error: '',
  hint: '',
  autocomplete: undefined,
  inputmode: undefined,
  id: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
}>()

// Auto-generate a stable id when caller didn't provide one. useId() is
// SSR-safe and stable across hydration.
const reactiveId = useId()
const inputId = computed(() => props.id ?? `inp-${reactiveId}`)
const describedById = computed(() =>
  props.error ? `${inputId.value}-err` : props.hint ? `${inputId.value}-hint` : undefined,
)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-small font-medium text-text-primary">
      {{ label }}<span v-if="required" class="text-status-error ml-0.5">*</span>
    </label>

    <input
      :id="inputId"
      :type="type"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :aria-invalid="!!error"
      :aria-describedby="describedById"
      class="h-input rounded-input border bg-surface px-3 text-body text-text-primary placeholder-text-disabled outline-none transition focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-surface-muted disabled:text-text-disabled"
      :class="[
        error ? 'border-status-error' : 'border-border',
      ]"
      @input="onInput"
      @blur="emit('blur', $event)"
    >

    <p
      v-if="error"
      :id="`${inputId}-err`"
      class="text-small text-status-error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="`${inputId}-hint`"
      class="text-small text-text-secondary"
    >
      {{ hint }}
    </p>
  </div>
</template>
