<!--
  app/pages/admin/properties/[id]/inspection/[inspectionId].vue —
  W2-2 (EH-F / ADR-0019). Thin route wrapper around <InspectionForm/>.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({ middleware: ['role'], requiredRoles: ROLE_GROUPS.admin })

const route = useRoute()
const propertyId = computed(() => String(route.params.id))
const inspectionId = computed(() => String(route.params.inspectionId))

function onSigned(): void {
  // After a sign we stay on the page so the inspector can see the
  // evaluator findings. The form re-renders in read-only mode.
  // (Future: route back to the property timeline.)
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="inspection-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: 'Property', to: `/admin/properties/${propertyId}` },
        { label: 'Inspection' },
      ]"
    />
    <InspectionForm :inspection-id="inspectionId" @signed="onSigned" />
  </div>
</template>
