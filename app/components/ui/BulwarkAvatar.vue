<!--
  BulwarkAvatar.vue — person or company avatar (Packet A components/SPEC.md, WP-A2).

  Photo when `src` is a safe URL, initials otherwise, on the accent tones the
  design specifies (contrast-safe in both themes; the old per-name palette
  failed 4.5:1 in dark mode). `presence` adds an online/offline dot that is
  also spelled out in the accessible name. Sizes sm 24 / md 32 / lg 48 / xl 80.
-->
<script setup lang="ts">
import { safeUrl } from '~/utils/safeUrl'

interface Props {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'square'
  presence?: 'online' | 'offline' | null
}
const props = withDefaults(defineProps<Props>(), { src: null, size: 'md', shape: 'circle', presence: null })

const initials = computed(() =>
  props.name
    .split(/\s+/u)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)
const url = computed(() => (props.src ? safeUrl(props.src) : null))
const label = computed(() => (props.presence ? `${props.name} (${props.presence})` : props.name))
</script>

<template>
  <span class="relative inline-flex shrink-0" role="img" :aria-label="label" :title="name">
    <span
      class="bw-avatar overflow-hidden"
      :class="[size !== 'md' && `bw-avatar--${size}`]"
      :style="shape === 'square' ? 'border-radius: var(--radius-md)' : undefined"
      aria-hidden="true"
    >
      <img v-if="url" :src="url" alt="" class="h-full w-full object-cover">
      <template v-else>{{ initials }}</template>
    </span>
    <span
      v-if="presence"
      class="absolute bottom-0 right-0 rounded-full"
      :style="{
        width: size === 'sm' ? '8px' : '10px',
        height: size === 'sm' ? '8px' : '10px',
        background: presence === 'online' ? 'var(--success-fg)' : 'var(--neutral-400)',
        boxShadow: '0 0 0 2px var(--bg-card)',
      }"
      aria-hidden="true"
    />
  </span>
</template>
