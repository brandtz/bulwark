<!--
  app/components/property/PropertyCard.vue — pipeline kanban card (E3-S1, E3-S3).

  # Decisions (ADR-0008)
    - One card = one Property. Renders address line 1, city/state, the
      canonical `<StatusBadge>`, and a `<PropertyStatusMenu>` for inline
      status changes (E3-S3). Clickable wrapper navigates to the detail
      hub at `/admin/properties/{id}`.
    - We expose `data-testid="property-card"` and `:data-property-id` on
      the root so the kanban Playwright spec can pick a card by id without
      matching against display text.

  # Decision cast down
    - Rejected: rolling a custom card surface. `BulwarkCard` already owns
      the radius / shadow tokens (STYLE_GUIDE §6.3); duplicating them here
      drifts.
    - Rejected: emitting clicks from inside the menu up through the
      `<NuxtLink>`. Menu interactions live entirely on the card; the link
      navigation is reserved for the body of the card (the menu's button
      stops propagation).
-->
<script setup lang="ts">
import type { Property, PropertyStatus } from '~~/shared/contracts/property'

defineProps<{ property: Property }>()
defineEmits<{ 'change-status': [propertyId: string, status: PropertyStatus] }>()
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
        <div class="flex items-start gap-1 shrink-0">
          <StatusBadge :status="property.status" />
          <PropertyStatusMenu
            :property="property"
            @change-status="(s) => $emit('change-status', property.id, s)"
          />
        </div>
      </div>
    </BulwarkCard>
  </NuxtLink>
</template>
