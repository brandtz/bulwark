<!--
  BulwarkBreadcrumbs.vue — location trail (Packet A components/SPEC.md, WP-A2).

  nav[aria-label=Breadcrumb] > ol; the last item is the current page
  (aria-current). More than `collapseAfter` items collapse the middle into an
  ellipsis (first + last two stay). `backOnly` renders a single "‹ Parent" link
  (mobile headers). Items without `to` are plain text.
-->
<script setup lang="ts">
interface Crumb { label: string; to?: string }
const props = withDefaults(defineProps<{
  items: Crumb[]
  collapseAfter?: number
  backOnly?: boolean
}>(), { collapseAfter: 3, backOnly: false })

type Shown = Crumb & { ellipsis?: true; idx: number }
const shown = computed<Shown[]>(() => {
  const all = props.items.map((c, idx) => ({ ...c, idx }))
  if (all.length <= props.collapseAfter) return all
  return [all[0]!, { label: '…', ellipsis: true, idx: -1 }, ...all.slice(-2)]
})
const parent = computed(() => [...props.items].slice(0, -1).reverse().find((c) => c.to))
const last = computed(() => props.items.length - 1)
</script>

<template>
  <nav aria-label="Breadcrumb" class="min-w-0">
    <NuxtLink v-if="backOnly && parent" :to="parent.to!" class="bw-crumbs">
      <BulwarkIcon name="chevron-left" size="sm" />{{ parent.label }}
    </NuxtLink>
    <ol v-else class="bw-crumbs min-w-0">
      <li v-for="(item, i) in shown" :key="`${item.label}-${item.idx}`" class="flex items-center gap-1.5 min-w-0">
        <span v-if="item.ellipsis" aria-hidden="true">…</span>
        <NuxtLink
          v-else-if="item.to && item.idx < last"
          :to="item.to"
          class="truncate hover:underline"
        >{{ item.label }}</NuxtLink>
        <span
          v-else
          class="truncate"
          :class="item.idx === last && 'cur'"
          :aria-current="item.idx === last ? 'page' : undefined"
        >{{ item.label }}</span>
        <BulwarkIcon v-if="i < shown.length - 1" name="chevron-right" size="sm" />
      </li>
    </ol>
  </nav>
</template>
