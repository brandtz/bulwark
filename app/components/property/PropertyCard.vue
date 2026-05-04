<!--
  app/components/property/PropertyCard.vue — pipeline kanban card (E3-S1).

  # Decisions (ADR-0008)
    - One card = one Property. Renders address line 1, city/state, and the
      canonical `<StatusBadge>`. Clickable wrapper navigates to the detail
      hub at `/admin/properties/{id}` (the page itself ships in E3-S5).
    - We expose `data-testid="property-card"` and `:data-property-id` on
      the root so the kanban Playwright spec can pick a card by id without
      matching against display text (which changes as fixtures evolve).

  # Decision cast down
    - Rejected: rolling a custom card surface. `BulwarkCard` already owns
      the radius / shadow tokens (STYLE_GUIDE §6.3); duplicating them here
      drifts.
-->
<script setup lang="ts">
import type { Property } from '~~/shared/contracts/property'

const props = defineProps<{ property: Property }>()
</script>

<template>
  <NuxtLink
    :to="`/admin/properties/${property.id}`"
    :data-testid="'property-card'"
    :data-property-id="property.id"
    class="block"
  >
    <BulwarkCard padding="sm" clickable>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-body font-medium text-text-primary truncate">
            {{ property.addressLine1 }}
          </p>
          <p class="text-caption text-text-secondary mt-0.5 truncate">
            {{ property.city }}, {{ property.state }} {{ property.postalCode }}
          </p>
        </div>
        <StatusBadge :status="property.status" />
      </div>
    </BulwarkCard>
  </NuxtLink>
</template>
