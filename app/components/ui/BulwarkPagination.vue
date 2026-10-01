<!--
  BulwarkPagination.vue — list paging (Packet A components/SPEC.md, WP-A2).

  Two modes, matching the services (WP-L06):
    - page: numbered strip with edge condensation (1 … 7 8 [9] 10 11 … 42),
      Prev/Next disabled (not hidden) at the edges; emits update:page.
    - cursor: "Load more" while `hasMore`; emits load-more. Use it for keyset
      lists, where a page number has no meaning.
  `pageSizeOptions` adds a rows-per-page select (emits update:pageSize).
  The consumer owns URL state and refetching.
-->
<script setup lang="ts">
interface Props {
  mode?: 'page' | 'cursor'
  page?: number
  pageSize?: number
  total?: number
  hasMore?: boolean
  loading?: boolean
  pageSizeOptions?: number[]
}
const props = withDefaults(defineProps<Props>(), {
  mode: 'page',
  page: 1,
  pageSize: 25,
  total: 0,
  hasMore: false,
  loading: false,
  pageSizeOptions: undefined,
})
const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
  'load-more': []
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

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
  <nav class="flex items-center gap-3 flex-wrap" aria-label="Pagination">
    <div v-if="mode === 'page'" class="bw-pager">
      <button type="button" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)">
        <BulwarkIcon name="chevron-left" size="sm" />
      </button>
      <template v-for="(p, idx) in pageStrip" :key="`p-${idx}`">
        <span v-if="p === null" class="px-1" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="tnum"
          :class="{ 'is-on': p === page }"
          :aria-current="p === page ? 'page' : undefined"
          :aria-label="`Page ${p}`"
          @click="go(p)"
        >{{ p }}</button>
      </template>
      <button type="button" :disabled="page >= totalPages" aria-label="Next page" @click="go(page + 1)">
        <BulwarkIcon name="chevron-right" size="sm" />
      </button>
    </div>
    <BulwarkButton
      v-else-if="hasMore"
      variant="secondary"
      size="sm"
      :loading="loading"
      @click="emit('load-more')"
    >Load more</BulwarkButton>

    <label v-if="pageSizeOptions?.length" class="bw-help flex items-center gap-2 ml-auto">
      Rows per page
      <select
        class="bw-input bw-select"
        style="height: var(--control-h-sm); width: auto"
        :value="pageSize"
        @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
      </select>
    </label>
  </nav>
</template>
