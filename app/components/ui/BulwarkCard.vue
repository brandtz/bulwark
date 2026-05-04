<!--
  BulwarkCard.vue — surface container.
  STYLE_GUIDE §6.3: 12px radius, subtle shadow, white surface, optional padding.
-->
<script setup lang="ts">
type Padding = 'none' | 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  padding?: Padding
  clickable?: boolean
  as?: string
}>(), { padding: 'md', clickable: false, as: 'div' })

const paddingClass: Record<Padding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-6',
}
</script>

<template>
  <component
    :is="as"
    :class="[
      'bg-surface border border-border rounded-card shadow-card',
      paddingClass[padding],
      clickable && 'hover:shadow-card-hover transition-shadow cursor-pointer',
    ]"
  >
    <slot />
  </component>
</template>
