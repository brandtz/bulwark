<!--
  BulwarkKanbanBoard.vue — pipeline board (Packet A components/SPEC.md, WP-A3).

  Columns come from the tenant's status config (never hardcoded): each is a
  <ul aria-label="<status>"> with its badge, count and optional WIP limit
  (over-limit is spelled out, not only coloured). Cards are focusable.

  Moving a card: pointer drag-and-drop, or keyboard (Space picks up, ←/→
  choose the column, Enter drops, Esc cancels). `canMove(card, from, to)`
  returns true or the reason the transition is illegal; illegal moves are
  refused and the card stays put. Every outcome is announced in a polite live
  region ("Moved 1842 Rimrock Rd to Quoted" / "Can't move … to Paid: …").
  Emits move(card, from, to, index), open(card), collapse(columnId).
  Card body: the `card` slot (default shows the title field). With `cardHref`
  each card is a link (Enter follows it natively) instead of a button.
  Columns are labelled "<status>, n <itemNoun>"; an empty column shows a
  "Drop here" placeholder (the `empty` slot overrides it).
-->
<script setup lang="ts" generic="C extends Record<string, unknown>">
import type { StatusHue } from '~~/shared/utils/status-hue'

export interface KanbanColumn { status: { id: string, label: string, hue: StatusHue }, wip?: number, collapsed?: boolean }

interface Props {
  columns: KanbanColumn[]
  cards: C[]
  /** Card field holding its column (status id). */
  groupBy?: string
  cardKey?: string
  titleKey?: string
  draggable?: boolean
  canMove?: (card: C, from: string, to: string) => true | string
  cardHref?: (card: C) => string
  /** Plural noun for column labels ("Quoted, 3 properties"). */
  itemNoun?: string
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  groupBy: 'status',
  cardKey: 'id',
  titleKey: 'title',
  draggable: true,
  canMove: () => true as const,
  cardHref: undefined,
  itemNoun: 'cards',
  disabled: false,
})
const NuxtLink = resolveComponent('NuxtLink')
const canDrag = computed(() => props.draggable && !props.disabled)
const emit = defineEmits<{
  move: [card: C, from: string, to: string, index: number]
  open: [card: C]
  collapse: [columnId: string]
}>()

const announcement = ref('')
const keyOf = (c: C) => String(c[props.cardKey])
const titleOf = (c: C) => String(c[props.titleKey] ?? keyOf(c))
const columnOf = (c: C) => String(c[props.groupBy])
const cardsIn = (id: string) => props.cards.filter((c) => columnOf(c) === id)
const labelOf = (id: string) => props.columns.find((c) => c.status.id === id)?.status.label ?? id

function attempt(card: C, to: string) {
  const from = columnOf(card)
  if (from === to) return
  const verdict = props.canMove(card, from, to)
  if (verdict !== true) {
    announcement.value = `Can't move ${titleOf(card)} to ${labelOf(to)}: ${verdict}`
    return
  }
  emit('move', card, from, to, cardsIn(to).length)
  announcement.value = `Moved ${titleOf(card)} to ${labelOf(to)}`
}

// ---- pointer drag -----------------------------------------------------------
const dragging = shallowRef<C | null>(null)
const over = ref<string | null>(null)
function onDragStart(e: DragEvent, card: C) {
  if (!canDrag.value) {
    e.preventDefault()
    return
  }
  dragging.value = card
  e.dataTransfer?.setData('text/plain', keyOf(card))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDrop(to: string) {
  if (dragging.value) attempt(dragging.value, to)
  dragging.value = null
  over.value = null
}
const dropAllowed = (to: string) => !dragging.value || columnOf(dragging.value) === to || props.canMove(dragging.value, columnOf(dragging.value), to) === true

// ---- keyboard move ------------------------------------------------------------
const lifted = shallowRef<C | null>(null)
const target = ref<string | null>(null)
const cardEls = new Map<string, HTMLElement>()
function setCardEl(card: C, el: unknown) {
  const node = (el as { $el?: unknown } | null)?.$el ?? el
  if (node instanceof HTMLElement) cardEls.set(keyOf(card), node)
}

function onCardKey(e: KeyboardEvent, card: C) {
  if (!canDrag.value && e.key === ' ') return
  if (!lifted.value) {
    if (e.key === ' ') {
      e.preventDefault()
      lifted.value = card
      target.value = columnOf(card)
      announcement.value = `Picked up ${titleOf(card)} in ${labelOf(target.value)}. Use left and right to choose a column, Enter to drop, Escape to cancel.`
    } else if (e.key === 'Enter' && !props.cardHref) {
      emit('open', card)
    }
    return
  }
  const ids = props.columns.map((c) => c.status.id)
  const i = ids.indexOf(target.value ?? '')
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    target.value = ids[Math.min(ids.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))] ?? target.value
    announcement.value = `${labelOf(target.value!)}`
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const card2 = lifted.value
    lifted.value = null
    attempt(card2, target.value!)
    target.value = null
    nextTick(() => cardEls.get(keyOf(card2))?.focus())
  } else if (e.key === 'Escape') {
    announcement.value = `Cancelled. ${titleOf(lifted.value)} stays in ${labelOf(columnOf(lifted.value))}.`
    lifted.value = null
    target.value = null
  }
}
</script>

<template>
  <div class="relative">
    <p class="sr-only" aria-live="polite" data-testid="kanban-live">{{ announcement }}</p>
    <div class="flex gap-4 overflow-x-auto pb-2">
      <section
        v-for="col in columns"
        :key="col.status.id"
        class="flex flex-col gap-2 shrink-0"
        :style="{ width: col.collapsed ? '56px' : '280px' }"
        :data-column="col.status.id"
        data-testid="kanban-column"
        :data-drop-target="target === col.status.id || over === col.status.id || undefined"
        @dragover.prevent="over = col.status.id; $event.dataTransfer && ($event.dataTransfer.dropEffect = dropAllowed(col.status.id) ? 'move' : 'none')"
        @dragleave="over = null"
        @drop.prevent="onDrop(col.status.id)"
      >
        <header class="flex items-center gap-2 px-1">
          <StatusBadge :hue="col.status.hue" :label="col.status.label" />
          <span class="bw-help tnum">{{ cardsIn(col.status.id).length }}<template v-if="col.wip"> / {{ col.wip }}</template></span>
          <span v-if="col.wip && cardsIn(col.status.id).length > col.wip" class="bw-error" style="font-size: var(--text-xs)">Over limit</span>
          <button type="button" class="ml-auto bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm" :aria-label="`${col.collapsed ? 'Expand' : 'Collapse'} ${col.status.label}`" @click="emit('collapse', col.status.id)">
            <BulwarkIcon :name="col.collapsed ? 'chevron-right' : 'chevron-left'" size="sm" />
          </button>
        </header>
        <ul
          v-if="!col.collapsed"
          class="flex flex-col gap-2 p-2 min-h-24"
          :aria-label="`${col.status.label}, ${cardsIn(col.status.id).length} ${itemNoun}`"
          style="background: var(--bg-sunken); border-radius: var(--radius-lg)"
          :style="(target === col.status.id || over === col.status.id) ? { outline: `2px dashed ${dropAllowed(col.status.id) && (!lifted || canMove(lifted, columnOf(lifted), col.status.id) === true) ? 'var(--accent)' : 'var(--danger-fg)'}` } : undefined"
        >
          <li v-for="card in cardsIn(col.status.id)" :key="keyOf(card)">
            <component
              :is="cardHref ? NuxtLink : 'div'"
              :ref="(el: unknown) => setCardEl(card, el)"
              :to="cardHref ? cardHref(card) : undefined"
              class="bw-card bw-card--sm bw-card--clickable block"
              :class="lifted && keyOf(lifted) === keyOf(card) && 'bw-card--selected'"
              :tabindex="cardHref ? undefined : 0"
              :role="cardHref ? undefined : 'button'"
              :aria-roledescription="canDrag ? 'Draggable card' : undefined"
              :aria-pressed="!cardHref && lifted && keyOf(lifted) === keyOf(card) ? true : undefined"
              :aria-current="cardHref && lifted && keyOf(lifted) === keyOf(card) ? 'true' : undefined"
              :draggable="canDrag"
              data-testid="kanban-card"
              :data-card="keyOf(card)"
              @dragstart="onDragStart($event, card)"
              @click="cardHref ? undefined : emit('open', card)"
              @keydown="onCardKey($event, card)"
            >
              <slot name="card" :card="card">
                <p class="font-semibold truncate">{{ titleOf(card) }}</p>
              </slot>
            </component>
          </li>
          <li v-if="!cardsIn(col.status.id).length" class="bw-help text-center py-4" data-testid="kanban-empty">
            <slot name="empty" :column="col">Drop here</slot>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
