<!--
  BulwarkSkeleton.vue — loading placeholder.

  Why this component exists
  -------------------------
  Every list page should render the shell + skeleton while data fetches.
  Inconsistent spinners and "Loading..." strings in the demo were ugly.
  This is the only loading-state primitive other than progress bars.
-->
<script setup lang="ts">
interface Props {
  variant?: 'text' | 'card' | 'avatar' | 'rect'
  /** Used for variant=text to render multiple lines. */
  lines?: number
  /** Optional explicit height for variant=rect. Tailwind class string. */
  heightClass?: string
}
withDefaults(defineProps<Props>(), {
  variant: 'text',
  lines: 1,
  heightClass: 'h-24',
})
</script>

<template>
  <div :aria-busy="true" :aria-live="'polite'" class="animate-pulse">
    <template v-if="variant === 'text'">
      <div
        v-for="i in lines"
        :key="i"
        class="h-4 bg-surface-muted rounded"
        :class="i === lines && lines! > 1 && 'w-3/4'"
        :style="i > 1 ? 'margin-top: 0.5rem' : undefined"
      />
    </template>
    <div
      v-else-if="variant === 'avatar'"
      class="h-9 w-9 rounded-full bg-surface-muted"
    />
    <div
      v-else-if="variant === 'card'"
      class="h-32 rounded-card bg-surface-muted"
    />
    <div v-else class="rounded-input bg-surface-muted" :class="heightClass" />
  </div>
</template>
