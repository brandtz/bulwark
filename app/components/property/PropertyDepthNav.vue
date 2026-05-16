<!--
  app/components/property/PropertyDepthNav.vue — W2-1 / EH-E (ADR-0018).

  # Decisions (ADR-0008)
    - Sub-navigation rendered as NuxtLinks rather than as a sixth row of
      the existing BulwarkTabs because each depth surface is its own
      route (we can deep-link the kanban into "this property's photos").
    - Uses useLabel() so the namespace 'property.tabs' can be re-labelled
      per tenant via CMS without code change (ADR-0014).
    - We do NOT highlight an `active` link via `:to` exact-match alone —
      `exact-active-class` from NuxtLink is enough for the leaf routes,
      but Overview is the index route so we add a manual `isOverview`
      computed.

  # Decision cast down
    - Rejected: collapsing the Buildings sub-tree (Buildings + per-building
      detail) into a nested router-view. That would need a layout file
      and an extra param hop; the flat NuxtLink list is simpler.
-->
<script setup lang="ts">
const props = defineProps<{ propertyId: string }>()

const route = useRoute()
const { t: tLabel } = useLabel()

const base = computed(() => `/admin/properties/${props.propertyId}`)

const isOverview = computed(() => route.path === base.value || route.path === `${base.value}/`)

type Item = { key: string; label: string; to: string; manualActive?: boolean }

const items = computed<Item[]>(() => [
  { key: 'overview',    label: tLabel('property.tabs', 'overview',    'Overview'),    to: base.value,                  manualActive: isOverview.value },
  { key: 'buildings',   label: tLabel('property.tabs', 'buildings',   'Buildings'),   to: `${base.value}/buildings` },
  { key: 'contacts',    label: tLabel('property.tabs', 'contacts',    'Contacts'),    to: `${base.value}/contacts` },
  { key: 'photos',      label: tLabel('property.tabs', 'photos',      'Photos'),      to: `${base.value}/photos` },
  { key: 'attachments', label: tLabel('property.tabs', 'attachments', 'Attachments'), to: `${base.value}/attachments` },
])
</script>

<template>
  <nav
    class="flex flex-wrap items-center gap-1 border-b border-border-default mb-4"
    data-testid="property-depth-nav"
    aria-label="Property depth sections"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :class="[
        'px-3 py-2 text-body border-b-2 -mb-px',
        item.manualActive
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-text-secondary hover:text-text-primary',
      ]"
      active-class="border-primary text-primary font-medium"
      :data-depth-tab="item.key"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
