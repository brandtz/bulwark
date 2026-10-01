<!--
  BulwarkKeyValue.vue — labelled facts (Packet A components/SPEC.md, WP-A3).

  A <dl>: dt/dd semantics. `columns` 1 or 2 pairs per row (auto: 2 when there
  are more than 4 items); always one column under 480px. Item `type` formats
  the value: money (cents), date, datetime, email/phone (links), mono; an empty
  value is an em dash, never blank. `dense` tightens the rhythm.
-->
<script setup lang="ts">
type ItemType = 'text' | 'money' | 'date' | 'datetime' | 'email' | 'phone' | 'mono'
interface Item { key: string, value: string | number | null | undefined, type?: ItemType }
interface Props {
  items: Item[]
  columns?: 1 | 2
  dense?: boolean
}
const props = withDefaults(defineProps<Props>(), { columns: undefined, dense: false })

const cols = computed(() => props.columns ?? (props.items.length > 4 ? 2 : 1))

function display(i: Item): string {
  if (i.value === null || i.value === undefined || i.value === '') return '—'
  if (i.type === 'money' && typeof i.value === 'number') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(i.value / 100)
  if (i.type === 'date' || i.type === 'datetime') {
    const d = new Date(String(i.value))
    if (Number.isNaN(d.getTime())) return String(i.value)
    return new Intl.DateTimeFormat('en-US', i.type === 'date'
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
  }
  return String(i.value)
}
const href = (i: Item) => (i.value && i.type === 'email' ? `mailto:${i.value}` : i.value && i.type === 'phone' ? `tel:${String(i.value).replace(/[^\d+]/gu, '')}` : null)
</script>

<template>
  <dl
    class="bw-kv bw-kv-grid"
    :class="cols === 2 && 'bw-kv-grid--2'"
    :style="dense ? 'gap: 4px 16px' : undefined"
  >
    <template v-for="i in items" :key="i.key">
      <dt>{{ i.key }}</dt>
      <dd :class="{ 'tnum': i.type === 'money', 'mono': i.type === 'mono' }">
        <a v-if="href(i)" :href="href(i)!" style="color: var(--text-link)">{{ display(i) }}</a>
        <template v-else>{{ display(i) }}</template>
      </dd>
    </template>
  </dl>
</template>

<style>
.bw-kv-grid--2 { grid-template-columns: max-content 1fr max-content 1fr; }
@media (max-width: 479px) { .bw-kv-grid, .bw-kv-grid--2 { grid-template-columns: 1fr; gap: 2px 0; } .bw-kv-grid dd { margin-bottom: 8px; } }
</style>
