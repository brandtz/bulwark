<!--
  BulwarkTabs.vue — tab list + panel (Packet A components/SPEC.md, WP-A2).

  WAI-ARIA tabs: role=tablist / tab / tabpanel, roving tabindex, Left/Right
  (and Home/End) move between enabled tabs and select them; the panel is
  labelled by the selected tab. Variants: underline (default) and segmented.
  `scrollable` lets a long strip scroll horizontally (counts stay visible).
  Tabs: SPEC `{ id, label, count?, disabled? }`; existing callers pass `value`
  instead of `id`, both work. Panels are named slots `tab-<id>`.
-->
<script setup lang="ts">
interface Tab { id?: string; value?: string; label: string; count?: number; disabled?: boolean }
interface Props {
  modelValue: string
  tabs: Tab[]
  variant?: 'underline' | 'segmented'
  scrollable?: boolean
  ariaLabel?: string
}
const props = withDefaults(defineProps<Props>(), { variant: 'underline', scrollable: true, ariaLabel: 'Tabs' })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const key = (t: Tab) => t.id ?? t.value ?? t.label
const uid = useId()
const tabId = (t: Tab) => `${uid}-tab-${key(t)}`
const panelId = `${uid}-panel`
const buttons = ref<HTMLButtonElement[]>([])

function select(t: Tab) {
  if (!t.disabled) emit('update:modelValue', key(t))
}

function onKey(e: KeyboardEvent, i: number) {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  let next = -1
  if (step) {
    for (let n = 1; n <= props.tabs.length; n++) {
      const idx = (i + step * n + props.tabs.length) % props.tabs.length
      if (!props.tabs[idx]!.disabled) { next = idx; break }
    }
  } else if (e.key === 'Home') next = props.tabs.findIndex((t) => !t.disabled)
  else if (e.key === 'End') next = props.tabs.findLastIndex((t) => !t.disabled)
  if (next < 0) return
  e.preventDefault()
  select(props.tabs[next]!)
  buttons.value[next]?.focus()
}
</script>

<template>
  <div>
    <div
      :class="variant === 'segmented' ? 'bw-seg' : 'bw-tabs'"
      :style="!scrollable ? 'overflow-x: visible; flex-wrap: wrap' : undefined"
      role="tablist"
      :aria-label="ariaLabel"
    >
      <button
        v-for="(t, i) in tabs"
        :id="tabId(t)"
        :key="key(t)"
        :ref="(el) => { if (el) buttons[i] = el as HTMLButtonElement }"
        type="button"
        role="tab"
        :class="{ 'is-on': modelValue === key(t) }"
        :aria-selected="modelValue === key(t)"
        :aria-controls="panelId"
        :tabindex="modelValue === key(t) ? 0 : -1"
        :disabled="t.disabled"
        @click="select(t)"
        @keydown="onKey($event, i)"
      >
        {{ t.label }}
        <span v-if="typeof t.count === 'number'" class="count tnum">{{ t.count }}</span>
      </button>
    </div>
    <div
      :id="panelId"
      role="tabpanel"
      :aria-labelledby="tabs.find((t) => key(t) === modelValue) ? tabId(tabs.find((t) => key(t) === modelValue)!) : undefined"
      tabindex="0"
      class="pt-4 focus:outline-none"
    >
      <slot :name="`tab-${modelValue}`" />
    </div>
  </div>
</template>
