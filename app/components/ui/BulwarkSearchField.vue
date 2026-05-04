<!--
  BulwarkSearchField.vue — debounced search input.

  Why this component exists
  -------------------------
  Every list page has a search bar. They all need a leading icon, a
  clear button, and debounced emit so we're not spamming the service.
  The demo's two search bars debounced differently and one didn't
  debounce at all — that was the kind of inconsistency that made it
  feel unfinished.
-->
<script setup lang="ts">
interface Props {
  modelValue: string
  placeholder?: string
  /** Delay before emitting update:modelValue. Default 250ms. */
  debounceMs?: number
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search...',
  debounceMs: 250,
  ariaLabel: 'Search',
})

const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

// Local copy so the input feels instant; we only emit upstream after debounce.
const local = ref(props.modelValue)
watch(() => props.modelValue, (v) => { local.value = v })

let timer: ReturnType<typeof setTimeout> | null = null
function onInput(e: Event) {
  local.value = (e.target as HTMLInputElement).value
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('update:modelValue', local.value), props.debounceMs)
}

function clear() {
  local.value = ''
  if (timer) clearTimeout(timer)
  emit('update:modelValue', '')
}
</script>

<template>
  <label class="relative block">
    <span class="sr-only">{{ ariaLabel }}</span>
    <span
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled"
      aria-hidden="true"
    >⌕</span>
    <input
      type="search"
      :value="local"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      class="h-input w-full rounded-input border border-border bg-surface pl-9 pr-9 text-body text-text-primary placeholder-text-disabled outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      @input="onInput"
    />
    <button
      v-if="local"
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-text-secondary hover:bg-surface-muted"
      :aria-label="`Clear ${ariaLabel}`"
      @click="clear"
    >×</button>
  </label>
</template>
