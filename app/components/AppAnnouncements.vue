<!--
  app/components/AppAnnouncements.vue — platform announcements banner
  (WP-X2, ED-007). Rendered at the top of every shell's main landmark; shows
  the active announcements the user has not dismissed. Client-only fetch so a
  banner never blocks or breaks SSR; failures render nothing.
-->
<script setup lang="ts">
import type { Announcement } from '~~/shared/contracts/announcement'

const { session } = useSession()
const service = useService('announcement')
const items = ref<Announcement[]>([])

onMounted(async () => {
  if (!session.value) return
  try {
    items.value = await service.listActive()
  } catch {
    items.value = []
  }
})

async function dismiss(id: string) {
  items.value = items.value.filter((a) => a.id !== id)
  try {
    await service.dismiss(id)
  } catch {
    // Dismissal is best-effort; the banner reappears next visit.
  }
}
</script>

<template>
  <div v-if="items.length" class="flex flex-col gap-2 px-4 pt-3" data-testid="announcements">
    <div
      v-for="a in items"
      :key="a.id"
      :role="a.tone === 'warning' ? 'alert' : 'status'"
      class="flex items-start gap-3 rounded-card border px-4 py-3 text-small"
      :class="a.tone === 'warning'
        ? 'border-status-warning/40 bg-warning-light text-text-primary'
        : 'border-status-info/40 bg-info-light text-text-primary'"
      :data-testid="`announcement-${a.id}`"
    >
      <div class="flex-1">
        <p class="font-semibold">{{ a.title }}</p>
        <p v-if="a.body" class="mt-0.5 text-text-secondary">{{ a.body }}</p>
      </div>
      <button
        type="button"
        class="min-h-tap min-w-tap -my-2 -mr-2 inline-flex items-center justify-center rounded-input hover:bg-surface-muted"
        :aria-label="`Dismiss: ${a.title}`"
        data-testid="announcement-dismiss"
        @click="dismiss(a.id)"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>
</template>
