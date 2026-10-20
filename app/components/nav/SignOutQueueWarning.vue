<script setup lang="ts">
import type { PendingQueuedWrite } from '~/composables/useOfflineQueue'

const props = defineProps<{
  open: boolean
  items: PendingQueuedWrite[]
  inspectionFailed: boolean
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = ref<HTMLElement | null>(null)
useFocusTrap(() => props.open, dialog)

function describeItem(item: PendingQueuedWrite): string {
  const path = item.url.split('?')[0]!.split('#')[0]!
  return `${item.method} ${path}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 flex items-center justify-center p-4"
      style="z-index: var(--z-modal); background: var(--overlay)"
      @click.self="emit('cancel')"
      @keydown.esc="emit('cancel')"
    >
      <section
        ref="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sign-out-queue-title"
        aria-describedby="sign-out-queue-description"
        tabindex="-1"
        class="w-full max-w-lg rounded-card border border-border bg-surface p-5 shadow-xl"
      >
        <h2 id="sign-out-queue-title" class="text-h3 font-semibold">Unsynced work</h2>
        <p id="sign-out-queue-description" class="mt-2 text-small text-text-secondary">
          <template v-if="inspectionFailed">
            Pending work could not be checked. Signing out may leave unsynced changes on this device.
          </template>
          <template v-else>
            These items have not synced. They will remain queued on this device; signing out does not discard them.
          </template>
        </p>
        <ul v-if="items.length" class="mt-3 max-h-48 space-y-1 overflow-auto text-small" data-testid="sign-out-queued-items">
          <li v-for="(item, index) in items" :key="`${item.namespace}-${index}`">
            {{ describeItem(item) }}
          </li>
        </ul>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="bw-btn bw-btn--secondary"
            data-testid="sign-out-cancel"
            @click="emit('cancel')"
          >
            Stay signed in
          </button>
          <button
            type="button"
            class="bw-btn bw-btn--destructive"
            data-testid="sign-out-confirm"
            @click="emit('confirm')"
          >
            Sign out anyway
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
