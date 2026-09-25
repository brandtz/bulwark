<!--
  app/components/property/PropertyStatusMenu.vue — inline status changer (E3-S3).

  # Decisions (ADR-0008)
    - This story originally called for drag-drop on desktop + long-press on
      mobile. Both are notoriously flaky to assert in Playwright (drag
      coordinates and timed long-press) and would force us into either
      a unit-only test (low confidence) or visual gating (defeats the
      purpose). We're shipping an explicit menu instead so:
        * Field staff can re-stage a property without two-handed gestures.
        * The Playwright spec is deterministic.
        * Drag-drop can layer on top later as pure UI sugar without
          changing the data path (we'd reuse `@change-status`).
    - The button stops `click` propagation so clicking it doesn't trigger
      the parent `<NuxtLink>` (PropertyCard wraps the whole card).
    - Menu is a simple absolutely-positioned panel; we don't pull in a
      headless menu lib for a 13-item static list. Escape + click-outside
      handlers are wired manually.

  # Decision cast down
    - Rejected: rendering the menu as a `<select>`. Native dropdown styling
      varies across OSes and the design system already prescribes a
      pill-rich panel. Also, `<select change>` would not give us
      individual `data-testid`s per status without a wrapper.
-->
<script setup lang="ts">
import {
  PROPERTY_STATUS_LABEL,
  type Property,
  type PropertyStatus,
} from '~~/shared/contracts/property'
import type { StatusPipelineNode } from '~~/shared/contracts/status-pipeline'

const props = defineProps<{ property: Property; statuses: StatusPipelineNode[] }>()
const emit = defineEmits<{ 'change-status': [status: string, reason?: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const { t: tLabel } = useLabel()
const currentNode = computed(() => props.statuses.find((node) => node.slug === props.property.status))
const availableStatuses = computed(() =>
  props.statuses.filter((node) => currentNode.value?.allowedTransitions.includes(node.slug)),
)

function labelFor(status: string) {
  return tLabel(
    'status.property',
    status,
    PROPERTY_STATUS_LABEL[status as PropertyStatus] ?? status.replaceAll('_', ' '),
  )
}

function toggle(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  open.value = !open.value
}

function pick(e: MouseEvent, status: StatusPipelineNode) {
  e.stopPropagation()
  e.preventDefault()
  open.value = false
  if (status.slug === props.property.status) return
  const reason = status.requiresReason ? window.prompt(`Reason for ${labelFor(status.slug)}:`) : undefined
  if (status.requiresReason && !reason?.trim()) return
  emit('change-status', status.slug, reason?.trim())
}

function onDocMouseDown(e: MouseEvent) {
  if (!open.value) return
  if (root.value && !root.value.contains(e.target as Node)) {
    open.value = false
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('mousedown', onDocMouseDown)
    document.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="h-7 w-7 inline-flex items-center justify-center rounded text-text-secondary hover:bg-surface-muted"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="`Change status for ${property.addressLine1}`"
      data-testid="status-menu-button"
      @click="toggle"
    >
      <span aria-hidden="true">⋮</span>
    </button>
    <div
      v-if="open"
      role="menu"
      class="absolute right-0 z-20 mt-1 w-56 rounded border border-border bg-surface shadow-lg py-1"
      data-testid="status-menu-panel"
    >
      <button
        v-for="status in availableStatuses"
        :key="status.slug"
        type="button"
        role="menuitem"
        class="w-full text-left px-3 py-1.5 text-small hover:bg-surface-muted flex items-center justify-between"
        :class="status.slug === property.status ? 'text-text-disabled cursor-default' : 'text-text-primary'"
        :data-testid="`status-menu-item-${status.slug}`"
        @click="pick($event, status)"
      >
        <span>{{ labelFor(status.slug) }}</span>
        <span v-if="status.slug === property.status" class="text-caption">current</span>
      </button>
    </div>
  </div>
</template>
