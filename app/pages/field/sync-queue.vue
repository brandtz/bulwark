<!--
  app/pages/field/sync-queue.vue — offline-mode placeholder (E10-S4).

  # Decisions (ADR-0008)
    - Honest stub: surfaces the affordance (the sponsor wants the
      navigation to exist) without a fake queue UI. ADR-0011 owns
      the offline strategy that lands in Phase 2.
    - Field-only route — admins don't have a sync queue.

  # Decision cast down
    - Rejected: a fake "0 items pending" counter. Field workers
      will trust whatever number we put on screen, and trust we
      can't currently honour. Better to be explicit.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

useHead({ title: 'Sync queue' })
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-sync-queue">
    <header>
      <h1 class="text-display">Sync queue</h1>
      <p class="text-body text-text-secondary mt-1">
        Offline mode lands in Phase 2.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-4" data-testid="field-sync-coming-soon">
      <p class="text-body font-medium">Coming with the PWA work</p>
      <p class="text-small text-text-secondary mt-1">
        When field crews lose signal at a remote site, captured
        assessments will queue here and sync automatically when
        connectivity returns. Today every save needs a connection.
      </p>
    </BulwarkCard>
  </div>
</template>
