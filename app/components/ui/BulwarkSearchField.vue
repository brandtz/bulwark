<!--
  BulwarkSearchField.vue — list search box (Packet A components/SPEC.md, WP-A2).

  type=search (role=searchbox). Typing emits update:modelValue after
  `debounce` ms (250); Enter emits `submit` immediately; Esc or the clear
  button empties it and emits `clear`. `shortcut` ("/" by default) focuses the
  field from anywhere on the page unless the user is typing in another field.
  `loading` swaps the search icon for a spinner while results load.
  `debounceMs` (existing callers) still works.
-->
<script setup lang="ts">
interface Props {
  modelValue: string
  placeholder?: string
  debounce?: number
  /** @deprecated use `debounce`. */
  debounceMs?: number
  /** Key that focuses the field; empty string disables it. */
  shortcut?: string
  loading?: boolean
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search…',
  debounce: 250,
  debounceMs: undefined,
  shortcut: '/',
  loading: false,
  ariaLabel: 'Search',
})
const emit = defineEmits<{
  'update:modelValue': [v: string]
  submit: [v: string]
  clear: []
}>()

const input = ref<HTMLInputElement | null>(null)
const local = ref(props.modelValue)
watch(() => props.modelValue, (v) => { local.value = v })

let timer: ReturnType<typeof setTimeout> | null = null
function onInput(e: Event) {
  local.value = (e.target as HTMLInputElement).value
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('update:modelValue', local.value), props.debounceMs ?? props.debounce)
}

function submit() {
  if (timer) clearTimeout(timer)
  emit('update:modelValue', local.value)
  emit('submit', local.value)
}

function clear() {
  local.value = ''
  if (timer) clearTimeout(timer)
  emit('update:modelValue', '')
  emit('clear')
  input.value?.focus()
}

function onGlobalKey(e: KeyboardEvent) {
  // defaultPrevented: another search field (the first mounted) already took
  // the shortcut, so a page with two never splits focus between them.
  if (!props.shortcut || e.key !== props.shortcut || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
  e.preventDefault()
  input.value?.focus()
}

onMounted(() => document.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKey)
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="bw-inputwrap" :class="local && 'has-suffix'">
    <span v-if="loading" class="bw-btn is-loading" style="position: absolute; left: 8px; width: 24px; min-width: 0; height: 24px; padding: 0; background: none" aria-hidden="true" />
    <BulwarkIcon v-else name="search" size="sm" />
    <input
      ref="input"
      type="search"
      :value="local"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :aria-keyshortcuts="shortcut || undefined"
      :aria-busy="loading || undefined"
      class="bw-input"
      @input="onInput"
      @keydown.enter.prevent="submit"
      @keydown.esc="local ? (clear(), $event.preventDefault()) : undefined"
    >
    <button
      v-if="local"
      type="button"
      class="suffix bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm"
      style="right: 4px"
      :aria-label="`Clear ${ariaLabel}`"
      @click="clear"
    >
      <BulwarkIcon name="x" size="sm" />
    </button>
  </div>
</template>
