<!-- Displays queued check-in writes; other offline work types are not queued yet. -->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { useOfflineQueue, type QueuedWrite } from '~/composables/useOfflineQueue'

definePageMeta({
  layout: 'field',
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
  fieldTitle: 'Sync queue',
})

useHead({ title: 'Sync queue' })

const offline = useOfflineQueue({ namespace: 'field-check-in' })
const queued = ref<QueuedWrite[]>([])

function refreshQueue() {
  queued.value = offline.snapshot()
}

onMounted(() => {
  refreshQueue()
  window.addEventListener('bulwark:offline-queue-changed', refreshQueue)
})
onBeforeUnmount(() => {
  window.removeEventListener('bulwark:offline-queue-changed', refreshQueue)
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-sync-queue">
    <header>
      <h1 class="text-display">Sync queue</h1>
      <p class="text-body text-text-secondary mt-1">
        {{ queued.length }} check-in update{{ queued.length === 1 ? '' : 's' }} pending.
      </p>
    </header>

    <BulwarkCard v-if="queued.length === 0" padding="md" class="mt-4" data-testid="field-sync-queue-empty">
      <p class="text-body text-text-secondary">No queued check-ins.</p>
    </BulwarkCard>
    <ul v-else class="mt-4 flex flex-col gap-2" data-testid="field-sync-queue-items">
      <li v-for="(item, index) in queued" :key="`${item.url}-${index}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ item.method }} {{ item.url }}</p>
          <p class="text-small text-text-secondary mt-1">Waiting for a connection to sync.</p>
        </BulwarkCard>
      </li>
    </ul>
  </div>
</template>
