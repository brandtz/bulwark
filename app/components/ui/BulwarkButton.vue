<!--
  BulwarkButton.vue — button primitive (Packet A components/SPEC.md, WP-A2).

  Styles are the design's `bw-btn` rules (app/assets/css/base.css); height and
  padding follow `--control-h` per data-density, colours follow the tokens, so
  light/dark/accent need no per-variant Tailwind.

  Decisions:
    - Existing props kept (`type`, `block`); SPEC adds `iconOnly`, the `link`
      variant and `menu` (split button).
    - `loading` keeps the label in the DOM (the width does not jump), hides it
      with the `is-loading` spinner and sets aria-busy; the button is inert.
    - `iconOnly` needs an accessible name: pass `aria-label` (warned in dev).
    - Split button: the main button emits `click`; the chevron opens a
      role=menu list (Arrow keys, Home/End, Enter/Space, Esc returns focus to
      the chevron) and emits `menu-select` with the chosen item.
    - Attributes (data-testid, aria-*) land on the main button, not the
      split wrapper.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId } from 'vue'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
type Size = 'sm' | 'md' | 'lg'

export interface MenuItem {
  label: string
  value?: string
  icon?: string
  disabled?: boolean
  destructive?: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  iconOnly?: boolean
  loading?: boolean
  disabled?: boolean
  block?: boolean
  menu?: MenuItem[]
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  iconOnly: false,
  loading: false,
  disabled: false,
  block: false,
  menu: undefined,
})

const emit = defineEmits<{
  click: [MouseEvent]
  'menu-select': [MenuItem]
}>()

const attrs = useAttrs()
if (import.meta.dev && props.iconOnly && !attrs['aria-label'] && !attrs['aria-labelledby']) {
  console.warn('[BulwarkButton] iconOnly buttons need an aria-label')
}

const classes = computed(() => [
  'bw-btn',
  `bw-btn--${props.variant}`,
  props.size !== 'md' && `bw-btn--${props.size}`,
  props.iconOnly && 'bw-btn--icon',
  props.loading && 'is-loading',
  props.block && !props.menu && 'w-full',
])

const inert = computed(() => props.disabled || props.loading)

// ---- split-button menu ----------------------------------------------------
const open = ref(false)
const active = ref(0)
const menuId = useId()
const toggleEl = ref<HTMLButtonElement | null>(null)
const itemEls = ref<HTMLElement[]>([])

function enabledIndex(from: number, step: 1 | -1): number {
  const items = props.menu ?? []
  for (let i = 1; i <= items.length; i++) {
    const idx = (from + step * i + items.length * 2) % items.length
    if (!items[idx]?.disabled) return idx
  }
  return from
}

async function openMenu(focusLast = false) {
  if (inert.value || !props.menu?.length) return
  open.value = true
  active.value = focusLast ? enabledIndex(0, -1) : enabledIndex(-1, 1)
  await nextTick()
  itemEls.value[active.value]?.focus()
  document.addEventListener('pointerdown', onOutside, true)
}

function closeMenu(returnFocus = true) {
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  if (returnFocus) toggleEl.value?.focus()
}

function onOutside(e: PointerEvent) {
  const root = toggleEl.value?.parentElement
  if (root && !root.contains(e.target as Node)) closeMenu(false)
}

function choose(item: MenuItem) {
  if (item.disabled) return
  emit('menu-select', item)
  closeMenu()
}

function onMenuKey(e: KeyboardEvent) {
  const items = props.menu ?? []
  if (e.key === 'ArrowDown') active.value = enabledIndex(active.value, 1)
  else if (e.key === 'ArrowUp') active.value = enabledIndex(active.value, -1)
  else if (e.key === 'Home') active.value = enabledIndex(-1, 1)
  else if (e.key === 'End') active.value = enabledIndex(items.length, -1)
  else if (e.key === 'Escape' || e.key === 'Tab') { closeMenu(e.key === 'Escape'); return }
  else if (e.key === 'Enter' || e.key === ' ') {
    // choose() closes the menu and returns focus to the toggle; stop here so
    // the item (about to be removed) is not re-focused below.
    e.preventDefault()
    const it = items[active.value]
    if (it) choose(it)
    return
  }
  else return
  e.preventDefault()
  itemEls.value[active.value]?.focus()
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <span v-if="menu" class="bw-split relative" :class="block && 'w-full'">
    <button
      v-bind="attrs"
      :type="type"
      :class="[...classes, block && 'flex-1']"
      :disabled="inert"
      :aria-busy="loading || undefined"
      @click="emit('click', $event)"
    >
      <slot name="icon" />
      <slot />
    </button>
    <button
      ref="toggleEl"
      type="button"
      :class="['bw-btn', `bw-btn--${variant}`, size !== 'md' && `bw-btn--${size}`]"
      :disabled="inert"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-label="`${attrs['aria-label'] ?? 'More'} options`"
      @click="open ? closeMenu() : openMenu()"
      @keydown.down.prevent="openMenu()"
      @keydown.up.prevent="openMenu(true)"
    >
      <BulwarkIcon name="chevron-down" size="sm" />
    </button>
    <div
      v-if="open"
      :id="menuId"
      role="menu"
      class="bw-menu absolute right-0 top-full mt-1"
      style="z-index: var(--z-dropdown)"
      @keydown="onMenuKey"
    >
      <div
        v-for="(item, i) in menu"
        :key="item.value ?? item.label"
        :ref="(el) => { if (el) itemEls[i] = el as HTMLElement }"
        role="menuitem"
        class="item"
        :class="{ 'is-on': i === active }"
        :style="item.destructive ? 'color: var(--danger-fg)' : undefined"
        :tabindex="i === active ? 0 : -1"
        :aria-disabled="item.disabled || undefined"
        @click="choose(item)"
        @mousemove="item.disabled || (active = i)"
      >
        {{ item.label }}
      </div>
    </div>
  </span>
  <button
    v-else
    v-bind="attrs"
    :type="type"
    :class="classes"
    :disabled="inert"
    :aria-busy="loading || undefined"
    @click="emit('click', $event)"
  >
    <slot name="icon" />
    <slot />
  </button>
</template>

<style>
/* Dark danger fill is a light coral (--danger-fg #F0857A): white text on it is
   about 2.4:1. Use the dark ink instead (about 7:1). base.css mirrors the design
   file (tokens-sync test), so the fix lives here. */
[data-theme="dark"] .bw-btn--destructive { color: var(--neutral-950); }
@media (prefers-color-scheme: dark) {
  [data-theme="system"] .bw-btn--destructive { color: var(--neutral-950); }
}
</style>
