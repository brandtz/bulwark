<!--
  BulwarkBanner.vue — page-level notice (Packet A components/SPEC.md, WP-A3).

  4px left rule in the tone colour on a flat tint (design rule). role=status;
  danger is role=alert. `offline` and `readonly` are persistent (never
  dismissible) and the shell renders them first after the skip link, above the
  top bar. `full` drops the radius for edge-to-edge strips. `brand` is the
  accent-900 strip (PWA install prompt, SH-40).
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type Tone = 'info' | 'warning' | 'danger' | 'success' | 'offline' | 'readonly' | 'brand'
interface Props {
  tone?: Tone
  action?: { label: string, fn: () => void } | null
  dismissible?: boolean
  full?: boolean
}
const props = withDefaults(defineProps<Props>(), { tone: 'info', action: null, dismissible: false, full: false })
const emit = defineEmits<{ dismiss: [] }>()

const ICON: Record<Tone, IconName> = {
  info: 'info', warning: 'alert-triangle', danger: 'alert-circle', success: 'check-circle',
  offline: 'refresh', readonly: 'eye', brand: 'download',
}
const persistent = computed(() => props.tone === 'offline' || props.tone === 'readonly')
const hidden = ref(false)
</script>

<template>
  <div
    v-if="!hidden"
    class="bw-banner"
    :class="[tone !== 'brand' && `bw-banner--${tone}`, full && 'bw-banner--full']"
    :style="tone === 'brand' ? '--b: var(--accent-500); --bg: var(--accent-900); --fg: var(--accent-50)' : undefined"
    :role="tone === 'danger' ? 'alert' : 'status'"
  >
    <BulwarkIcon :name="ICON[tone]" size="sm" />
    <div class="min-w-0"><slot /></div>
    <button v-if="action" type="button" class="a" @click="action.fn()">{{ action.label }}</button>
    <button
      v-if="dismissible && !persistent"
      type="button"
      class="shrink-0"
      :class="!action && 'ml-auto'"
      aria-label="Dismiss"
      @click="hidden = true; emit('dismiss')"
    >
      <BulwarkIcon name="x" size="sm" />
    </button>
  </div>
</template>
