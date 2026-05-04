<!--
  BulwarkBreadcrumbs.vue — top-bar breadcrumbs.

  Why this component exists
  -------------------------
  Used inside AppTopBar's breadcrumbs slot. Keeps every page's breadcrumb
  rendering identical: separator character, link styling, current-page
  not-a-link treatment, truncation rule.
-->
<script setup lang="ts">
interface Crumb { label: string; to?: string }
defineProps<{ items: Crumb[] }>()
</script>

<template>
  <nav aria-label="Breadcrumb" class="min-w-0">
    <ol class="flex items-center gap-1.5 text-small text-text-secondary min-w-0">
      <li
        v-for="(item, idx) in items"
        :key="`${item.label}-${idx}`"
        class="flex items-center gap-1.5 min-w-0"
      >
        <NuxtLink
          v-if="item.to && idx < items.length - 1"
          :to="item.to"
          class="hover:text-text-primary transition truncate"
        >{{ item.label }}</NuxtLink>
        <span
          v-else
          class="text-text-primary font-medium truncate"
          :aria-current="idx === items.length - 1 ? 'page' : undefined"
        >{{ item.label }}</span>
        <span
          v-if="idx < items.length - 1"
          class="text-text-disabled"
          aria-hidden="true"
        >/</span>
      </li>
    </ol>
  </nav>
</template>
