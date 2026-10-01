<!--
  StatusBadge.vue — status pill (Packet A components/SPEC.md, WP-A2).

  Generic per SPEC: `hue` (one of the 12 status hues, contrast-tuned for both
  themes via data-hue tokens) + `label`. Label first, hue second: two statuses
  may share a hue, so the text is always present (the dot-only variant needs an
  aria-label).

  Existing callers pass a property `status`; it maps to the design's default
  hue (shared/utils/status-hue.ts) and the tenant label (useLabel). Screens
  with a pipeline record pass its `hue` (WP-X5) so tenant recolouring shows.
-->
<script setup lang="ts">
import type { PropertyStatus, PropertyStatusValue } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'
import { SLUG_DEFAULT_HUE, type StatusHue } from '~~/shared/utils/status-hue'
import type { IconName } from './icon-names'

export type { StatusHue }

const props = withDefaults(defineProps<{
  /** Property status (existing callers): hue and tenant label are derived. */
  status?: PropertyStatusValue
  hue?: StatusHue
  label?: string
  size?: 'sm' | 'md'
  variant?: 'solid' | 'outline' | 'dot'
  icon?: IconName
}>(), {
  status: undefined,
  hue: undefined,
  label: undefined,
  size: 'md',
  variant: 'solid',
  icon: undefined,
})


const { t: tLabel } = useLabel()

const resolvedHue = computed<StatusHue>(() => props.hue ?? (props.status ? SLUG_DEFAULT_HUE[props.status] : undefined) ?? 'gray')
const text = computed(() => {
  if (props.label) return props.label
  if (!props.status) return ''
  return tLabel(
    'status.property',
    props.status,
    PROPERTY_STATUS_LABEL[props.status as PropertyStatus] ?? props.status.replaceAll('_', ' '),
  )
})
</script>

<template>
  <span
    class="bw-badge"
    :class="[
      size === 'sm' && 'bw-badge--sm',
      variant === 'outline' && 'bw-badge--outline',
      variant === 'dot' && 'bw-badge--dot',
    ]"
    :data-hue="resolvedHue"
    :data-status="status"
    :role="variant === 'dot' ? 'img' : undefined"
    :aria-label="variant === 'dot' ? text : undefined"
    :title="variant === 'dot' ? text : undefined"
    data-testid="status-badge"
  >
    <template v-if="variant !== 'dot'">
      <BulwarkIcon v-if="icon" :name="icon" size="sm" />{{ text }}
    </template>
  </span>
</template>
