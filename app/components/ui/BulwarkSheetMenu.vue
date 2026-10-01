<!--
  BulwarkSheetMenu.vue — action list in a bottom sheet (Packet A components/SPEC.md, WP-A3).

  role=menu with 56px rows (thumb-sized), arrows move, Enter chooses. Used for
  the phone "More" sheet and row actions on touch.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

interface SheetItem { icon?: IconName, label: string, tone?: 'default' | 'danger', value?: string, action?: () => void }
interface Props {
  open: boolean
  title: string
  items: SheetItem[]
}
defineProps<Props>()
const emit = defineEmits<{ select: [item: SheetItem], close: [] }>()

const rows = ref<HTMLElement[]>([])
function onKey(e: KeyboardEvent, i: number, n: number) {
  const next = e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowUp' ? (i - 1 + n) % n : -1
  if (next < 0) return
  e.preventDefault()
  rows.value[next]?.focus()
}
function choose(it: SheetItem) {
  it.action?.()
  emit('select', it)
  emit('close')
}
</script>

<template>
  <BulwarkBottomSheet :open="open" :title="title" @close="emit('close')">
    <div role="menu" :aria-label="title">
      <button
        v-for="(it, i) in items"
        :key="it.label"
        :ref="(el) => { if (el) rows[i] = el as HTMLElement }"
        type="button"
        role="menuitem"
        class="row w-full text-left"
        :style="it.tone === 'danger' ? 'color: var(--danger-fg)' : undefined"
        @click="choose(it)"
        @keydown="onKey($event, i, items.length)"
      >
        <BulwarkIcon v-if="it.icon" :name="it.icon" />{{ it.label }}
      </button>
    </div>
  </BulwarkBottomSheet>
</template>
