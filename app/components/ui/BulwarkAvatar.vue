<!--
  BulwarkAvatar.vue — user avatar with initial fallback.

  Why this component exists
  -------------------------
  Topbar, user menu, comments, assignment chips — every place we show a
  person. Centralising means: same fallback (initials), same color
  derivation (deterministic per name), same circle.
-->
<script setup lang="ts">
interface Props {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
}
const props = withDefaults(defineProps<Props>(), { src: null, size: 'md' })

const initials = computed(() =>
  props.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)

// Deterministic background color from name hash so two users with the
// same initials are visually distinct. Limited palette keeps brand cohesion.
const palette = [
  'bg-status-info', 'bg-status-success', 'bg-status-warning',
  'bg-primary-700', 'bg-status-error',
]
const bg = computed(() => {
  let h = 0
  for (let i = 0; i < props.name.length; i++) h = (h * 31 + props.name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
})

const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
}
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white overflow-hidden"
    :class="[sizeClasses[size!], !src && bg]"
    :title="name"
    :aria-label="name"
  >
    <img
      v-if="src"
      :src="src"
      :alt="name"
      class="h-full w-full object-cover"
    />
    <template v-else>{{ initials }}</template>
  </span>
</template>
