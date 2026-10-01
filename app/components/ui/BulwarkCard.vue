<!--
  BulwarkCard.vue — surface container (Packet A components/SPEC.md, WP-A2).

  Shadow, never a hard border (direction 1b). Padding follows the density
  token (`--card-p`) at md. `selected` draws the accent ring and, on a
  clickable card, sets aria-pressed. `tone="danger"` adds the danger ring for
  irreversible-action cards (Stage 4 addendum, SH-33). `padding="none"` stays
  for existing callers that pad their own content.
  Slots: header, default, footer.
-->
<script setup lang="ts">
type Padding = 'none' | 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  padding?: Padding
  clickable?: boolean
  selected?: boolean
  tone?: 'default' | 'danger'
  as?: string
}>(), { padding: 'md', clickable: false, selected: false, tone: 'default', as: 'div' })

const slots = useSlots()
</script>

<template>
  <component
    :is="as"
    class="bw-card"
    :class="[
      padding === 'sm' && 'bw-card--sm',
      padding === 'lg' && 'bw-card--lg',
      clickable && 'bw-card--clickable',
      selected && 'bw-card--selected',
    ]"
    :style="[
      padding === 'none' ? 'padding: 0' : undefined,
      props.tone === 'danger' ? 'box-shadow: 0 0 0 1px var(--danger-border), var(--shadow-1)' : undefined,
    ]"
    :aria-pressed="clickable && (as === 'button' || $attrs.role === 'button') ? selected : undefined"
  >
    <header v-if="slots.header" class="mb-3"><slot name="header" /></header>
    <slot />
    <footer v-if="slots.footer" class="mt-4"><slot name="footer" /></footer>
  </component>
</template>
