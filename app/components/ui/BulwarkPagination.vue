<!--
  BulwarkPagination.vue — list pagination control.

  Why this component exists
  -------------------------
  Every list page (Properties, Work Orders, Invoices, Subcontractors,
  Users) needs the same pagination affordance. We emit `update:page`
  for the consumer to refetch. No URL state coupling here — that lives
  in the page component (so we can pick `useRouteQuery()` per epic).

  Decisions
  ---------
  - **Numeric strip with edge condensation**: 1 ... 7 8 [9] 10 11 ... 42
    pattern. Considered a "Load more" button; rejected because admin/ops
    users frequently jump to "page with that one work order" and need
    deterministic addressing.
  - **Disable, don't hide, prev/next at edges**: avoids layout jump.
-->
<script setup lang="ts">
interface Props {
  page: number       // 1-indexed
  pageSize: number
  total: number
}
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:page': [page: number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

// Build the page strip: always show first, last, current, and 2 neighbors.
// Use null entries to mark ellipsis gaps.
const pageStrip = computed<(number | null)[]>(() => {
  const total = totalPages.value
  const cur = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const out: (number | null)[] = [1]
  const left = Math.max(2, cur - 2)
  const right = Math.min(total - 1, cur + 2)
  if (left > 2) out.push(null)
  for (let i = left; i <= right; i++) out.push(i)
  if (right < total - 1) out.push(null)
  out.push(total)
  return out
})

function go(p: number) {
  if (p < 1 || p > totalPages.value || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <nav
    class="flex items-center gap-1 text-small"
    aria-label="Pagination"
  >
    <button
      type="button"
      class="h-9 px-3 rounded-input border border-border bg-surface text-text-primary hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
      :disabled="page <= 1"
      @click="go(page - 1)"
    >Prev</button>

    <template v-for="(p, idx) in pageStrip" :key="`p-${idx}`">
      <span v-if="p === null" class="px-2 text-text-disabled">…</span>
      <button
        v-else
        type="button"
        class="h-9 min-w-9 px-2 rounded-input border transition"
        :class="p === page
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-surface text-text-primary hover:bg-surface-muted'"
        :aria-current="p === page ? 'page' : undefined"
        @click="go(p)"
      >{{ p }}</button>
    </template>

    <button
      type="button"
      class="h-9 px-3 rounded-input border border-border bg-surface text-text-primary hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
      :disabled="page >= totalPages"
      @click="go(page + 1)"
    >Next</button>
  </nav>
</template>
