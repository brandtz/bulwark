<!--
  BulwarkButton.vue — primary button primitive.

  Decisions captured here (UI-CONTRACTS.md):
    - 4 variants: primary, secondary, ghost, destructive.
    - 3 sizes; sm = compact toolbars, md = default, lg = primary CTAs / mobile.
    - min-h-tap on every size — gloved-hand reachability per STYLE_GUIDE §6.1.

  Decisions NOT taken:
    - No icon-only "size square" mode yet — wait for first real need so we
      don't cargo-cult a Tailwind preset.
-->
<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
  block?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  loading: false,
  disabled: false,
  block: false,
})

const variantClasses: Record<Variant, string> = {
  primary:     'bg-primary text-white hover:bg-primary-hover disabled:bg-primary/50',
  secondary:   'bg-surface text-text-primary border border-border hover:bg-background disabled:text-text-disabled',
  ghost:       'bg-transparent text-text-primary hover:bg-background disabled:text-text-disabled',
  destructive: 'bg-error text-white hover:bg-error/90 disabled:bg-error/50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-5 text-body-strong',
}

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors min-h-tap',
      'disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      block && 'w-full',
    ]"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
    <slot />
  </button>
</template>
