<!--
  BulwarkChips.vue — one chip (Packet A components/SPEC.md, WP-A3).

  Variants: default, accent (program/trade tags), count (accent numeral,
  aria-label "<n> items"), filter (label + a real "Remove <label>" button),
  pressable (button[aria-pressed], toggles), dashed (add-filter affordance).
  `dot` adds an 8px leading dot in a status hue. Sizes sm 24 / md 32 / lg 36
  (touch). Never wraps internally; the container wraps or scrolls.
-->
<script setup lang="ts">
import type { StatusHue } from '~~/shared/utils/status-hue'

interface Props {
  variant?: 'default' | 'accent' | 'count' | 'filter' | 'pressable' | 'dashed'
  removable?: boolean
  pressed?: boolean
  dot?: StatusHue | null
  size?: 'sm' | 'md' | 'lg'
  /** Text for the count variant's accessible name and the remove button. */
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  removable: false,
  pressed: false,
  dot: null,
  size: 'sm',
  label: undefined,
})
const emit = defineEmits<{ remove: [], toggle: [pressed: boolean] }>()

const slots = useSlots()
const HEIGHT = { sm: '24px', md: '32px', lg: '36px' } as const
const isPressable = computed(() => props.variant === 'pressable')
const canRemove = computed(() => props.removable || props.variant === 'filter')
const style = computed(() => ({
  height: HEIGHT[props.size],
  whiteSpace: 'nowrap' as const,
  ...(props.size !== 'sm' ? { fontSize: 'var(--text-sm)', padding: '0 12px' } : {}),
  ...(props.variant === 'dashed' ? { borderStyle: 'dashed', background: 'transparent', color: 'var(--text-secondary)' } : {}),
  ...(isPressable.value && props.pressed ? { background: 'var(--bg-selected)', borderColor: 'var(--accent)', color: 'var(--text-primary)' } : {}),
}))
const accessibleText = computed(() => props.label ?? '')
</script>

<template>
  <component
    :is="isPressable ? 'button' : 'span'"
    :type="isPressable ? 'button' : undefined"
    class="bw-chip"
    :class="{ 'bw-chip--accent': variant === 'accent', 'bw-chip--count': variant === 'count', 'tnum': variant === 'count' }"
    :style="style"
    :aria-pressed="isPressable ? pressed : undefined"
    :aria-label="variant === 'count' && accessibleText ? `${accessibleText} items` : undefined"
    @click="isPressable && emit('toggle', !pressed)"
  >
    <span v-if="dot" class="rounded-full" :data-hue="dot" style="width: 8px; height: 8px; background: var(--hue-fg)" aria-hidden="true" />
    <slot v-if="slots.leading" name="leading" />
    <slot />
    <button
      v-if="canRemove"
      type="button"
      class="x inline-flex items-center justify-center"
      :aria-label="`Remove ${accessibleText || 'filter'}`"
      @click.stop="emit('remove')"
    >
      <BulwarkIcon name="x" size="sm" />
    </button>
  </component>
</template>
