<!--
  BulwarkToast.vue — one notification (Packet A components/SPEC.md, WP-A2; new).

  Always a dark surface (both themes), so the tone icons use the dark-theme
  status colours. Errors are role=alert and persistent by default (the host
  passes duration 0); everything else is role=status. The action is a real
  button; Dismiss is always present. Usually rendered by BulwarkToastHost from
  useToast(), not placed directly.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type Tone = 'info' | 'success' | 'warning' | 'error'
interface Props {
  tone?: Tone
  title: string
  body?: string
  action?: { label: string, fn: () => void } | null
  persistent?: boolean
  duration?: number
}
withDefaults(defineProps<Props>(), { tone: 'info', body: '', action: null, persistent: false, duration: 5000 })
const emit = defineEmits<{ action: [], dismiss: [] }>()

const ICON: Record<Tone, IconName> = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle' }
const COLOR: Record<Tone, string> = { info: '#7FB2E0', success: '#6FC594', warning: '#F5A365', error: '#F0857A' }
</script>

<template>
  <div class="bw-toast" :role="tone === 'error' ? 'alert' : 'status'" :data-tone="tone">
    <BulwarkIcon :name="ICON[tone]" size="sm" :style="{ color: COLOR[tone] }" />
    <div class="flex-1 min-w-0">
      <p class="t">{{ title }}</p>
      <p v-if="body" class="mt-0.5" style="color: var(--neutral-300)">{{ body }}</p>
    </div>
    <button v-if="action" type="button" class="a" @click="action.fn(); emit('action')">{{ action.label }}</button>
    <button
      type="button"
      class="shrink-0"
      style="color: var(--neutral-300)"
      aria-label="Dismiss"
      @click="emit('dismiss')"
    >
      <BulwarkIcon name="x" size="sm" />
    </button>
  </div>
</template>
