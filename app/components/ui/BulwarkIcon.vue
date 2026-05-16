<!--
  BulwarkIcon.vue — single icon primitive backed by /icons/sprite.svg.

  # Why a sprite (W2-6 / EH-L)
    - Zero JS runtime cost: the sprite is a static file under `public/`
      served as `/icons/sprite.svg`. No Iconify bundle, no `<Icon name>`
      runtime resolver.
    - All glyphs share one HTTP request; the browser caches the sprite
      across pages and the rendered `<use>` reference is essentially free.

  # Decisions captured here
    - We bind to symbol IDs of the form `bw-{name}` to keep the public-
      facing API stable even if we swap glyph sources later. The mapping
      is `ICON_NAMES` below — every name advertised by this component
      MUST have a matching `<symbol id="bw-{name}">` in the sprite. The
      unit test in `tests/unit/bulwark-icon.test.ts` enforces this.
    - Size is a token, not freeform: `sm | md | lg | xl`. Designers can
      add a new size by editing the SIZE_CLASS map below; consumers must
      not pass arbitrary tailwind sizes (use `class` for one-off cases).
    - `aria-hidden` is the default. If the icon conveys meaning that is
      not also expressed in adjacent text, the consumer MUST pass a
      `label` prop — we then set `role="img"` + `aria-label` and drop
      `aria-hidden`. This keeps icon-only buttons accessible.
    - `name` is a string union for editor autocomplete. Passing an
      unknown name is allowed at runtime (renders a missing-glyph
      square) but TypeScript will yell at the consume site.

  # Decisions NOT taken
    - We did NOT add a `color` prop. Color comes from `currentColor` via
      Tailwind text utilities at the consume site (e.g. `text-primary`).
      Centralizing color in the icon would fight the token system.
    - We did NOT memoize the sprite URL or inline-cache it. The browser
      handles that perfectly on its own; runtime caching would just be
      another bug surface.
-->
<script setup lang="ts">
/**
 * Canonical glyph names. Keep in sync with public/icons/sprite.svg —
 * the unit test cross-references this list against the sprite's
 * `<symbol id="bw-...">` entries.
 */
export const ICON_NAMES = [
  'alert-circle',
  'alert-triangle',
  'arrow-left',
  'arrow-right',
  'bell',
  'briefcase',
  'building',
  'calendar',
  'camera',
  'check',
  'check-circle',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'clipboard',
  'clock',
  'dollar-sign',
  'download',
  'edit',
  'external-link',
  'eye',
  'eye-off',
  'file',
  'file-text',
  'filter',
  'flame',
  'home',
  'image',
  'info',
  'list',
  'map-pin',
  'menu',
  'minus',
  'more-horizontal',
  'pencil',
  'phone',
  'plus',
  'printer',
  'refresh',
  'search',
  'settings',
  'shield',
  'tool',
  'trash',
  'upload',
  'user',
  'users',
  'wrench',
  'x',
  'x-circle',
] as const

export type IconName = (typeof ICON_NAMES)[number]

type Size = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<{
  name: IconName
  size?: Size
  /**
   * Accessible label. When provided the icon participates in the
   * accessibility tree as an image; otherwise it is purely decorative.
   */
  label?: string
}>(), {
  size: 'md',
  label: undefined,
})

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
}

const decorative = computed(() => props.label === undefined || props.label === '')
</script>

<template>
  <svg
    :class="['inline-block shrink-0', SIZE_CLASS[size]]"
    :aria-hidden="decorative ? 'true' : undefined"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    focusable="false"
  >
    <use :href="`/icons/sprite.svg#bw-${name}`" />
  </svg>
</template>
