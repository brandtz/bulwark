<!--
  BulwarkMenu.vue — dropdown action menu (Packet A bw-menu, WP-A3).

  The trigger slot receives `{ open, toggle, attrs }`: spread `attrs` onto
  your button (aria-haspopup/expanded/controls, keyboard opening). Items:
  { label, value?, icon?, disabled?, reason?, destructive?, separator?,
  heading? }. A disabled item stays visible and focusable-by-arrow with its
  `reason` as its description (SPEC: disallowed actions show why). Keyboard:
  ArrowDown/Up opens on the trigger; arrows/Home/End move; Enter/Space choose;
  Esc closes and returns focus; Tab closes. Emits `select` with the item.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

export interface MenuEntry {
  label: string
  value?: string
  icon?: IconName
  disabled?: boolean
  /** Why it is disabled (described to assistive tech and shown as a hint). */
  reason?: string
  destructive?: boolean
  separator?: boolean
  heading?: boolean
}

interface Props {
  items: MenuEntry[]
  align?: 'start' | 'end'
  label?: string
  /** SPEC: positioning anchor. The trigger slot is the anchor here; kept for API parity. */
  anchor?: Element | null
  /** Minimum width in px (SPEC 220). */
  width?: number
  /** ARIA container role (SPEC). Items use menuitem; a listbox uses option. */
  role?: 'menu' | 'listbox' | 'dialog'
}
const props = withDefaults(defineProps<Props>(), { align: 'start', label: 'Menu', anchor: null, width: 220, role: 'menu' })
const emit = defineEmits<{ select: [item: MenuEntry], close: [] }>()

const open = ref(false)
const active = ref(-1)
const root = ref<HTMLElement | null>(null)
const itemEls = ref<HTMLElement[]>([])
const uid = useId()
const menuId = `${uid}-menu`
let trigger: HTMLElement | null = null

const focusable = (i: number) => {
  const it = props.items[i]
  return !!it && !it.separator && !it.heading
}

function move(from: number, step: 1 | -1): number {
  for (let n = 1; n <= props.items.length; n++) {
    const i = (from + step * n + props.items.length * 2) % props.items.length
    if (focusable(i)) return i
  }
  return from
}

async function show(fromEnd = false) {
  trigger = document.activeElement as HTMLElement | null
  open.value = true
  active.value = fromEnd ? move(0, -1) : move(-1, 1)
  await nextTick()
  itemEls.value[active.value]?.focus()
  document.addEventListener('pointerdown', onOutside, true)
}

function hide(returnFocus = true) {
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  emit('close')
  if (returnFocus) trigger?.focus()
}

function toggle() {
  if (open.value) hide()
  else show()
}

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) hide(false)
}

function choose(it: MenuEntry | undefined) {
  if (!it || it.disabled || it.separator || it.heading) return
  hide()
  emit('select', it)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') active.value = move(active.value, 1)
  else if (e.key === 'ArrowUp') active.value = move(active.value, -1)
  else if (e.key === 'Home') active.value = move(-1, 1)
  else if (e.key === 'End') active.value = move(props.items.length, -1)
  else if (e.key === 'Escape') { e.preventDefault(); hide(); return }
  else if (e.key === 'Tab') { hide(false); return }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(props.items[active.value]); return }
  else return
  e.preventDefault()
  itemEls.value[active.value]?.focus()
}

const triggerAttrs = computed(() => ({
  'aria-haspopup': 'menu' as const,
  'aria-expanded': open.value,
  'aria-controls': menuId,
  onKeydown: (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(e.key === 'ArrowUp') }
  },
}))

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="root" class="relative inline-block">
    <slot name="trigger" :open="open" :toggle="toggle" :attrs="triggerAttrs" />
    <div
      v-if="open"
      :id="menuId"
      :role="role"
      :aria-label="label"
      class="bw-menu absolute top-full mt-1"
      :class="align === 'end' ? 'right-0' : 'left-0'"
      :style="{ zIndex: 'var(--z-dropdown)', minWidth: `${width}px`, maxHeight: '440px', overflowY: 'auto' }"
      @keydown="onKey"
    >
      <template v-for="(it, i) in items" :key="`${it.label}-${i}`">
        <div v-if="it.separator" class="sep" role="separator" />
        <div v-else-if="it.heading" class="hd" role="presentation">{{ it.label }}</div>
        <div
          v-else
          :ref="(el) => { if (el) itemEls[i] = el as HTMLElement }"
          :role="role === 'listbox' ? 'option' : 'menuitem'"
          class="item"
          :class="{ 'is-on': i === active }"
          :tabindex="i === active ? 0 : -1"
          :aria-disabled="it.disabled || undefined"
          :aria-describedby="it.disabled && it.reason ? `${uid}-why-${i}` : undefined"
          :style="[it.destructive && !it.disabled ? 'color: var(--danger-fg)' : '', it.disabled ? 'opacity: .55; cursor: not-allowed' : '']"
          :title="it.disabled ? it.reason : undefined"
          @click="choose(it)"
          @mousemove="active = i"
        >
          <BulwarkIcon v-if="it.icon" :name="it.icon" size="sm" />
          <span class="flex flex-col min-w-0">
            <span class="truncate">{{ it.label }}</span>
            <span v-if="it.disabled && it.reason" :id="`${uid}-why-${i}`" class="bw-help">{{ it.reason }}</span>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
