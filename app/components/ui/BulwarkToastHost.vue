<!--
  BulwarkToastHost.vue — singleton toast renderer.

  Mounted once in `app/layouts/default.vue`. Reads the queue from
  useToast() and renders dismissible cards in the top-right (desktop) /
  bottom (mobile) per STYLE_GUIDE.

  ADR-0005 edge: we deliberately mount this in the layout, not in
  individual pages, so toasts persist across navigation.
-->
<script setup lang="ts">
const { toasts, dismiss } = useToast()

const toneClass: Record<string, string> = {
  info: 'border-status-info',
  success: 'border-status-success',
  warning: 'border-status-warning',
  error: 'border-status-error',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-[60] flex flex-col gap-2 p-4 pointer-events-none w-full sm:w-auto sm:max-w-sm sm:right-0 sm:top-0 bottom-bottom-nav md:bottom-auto"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto rounded-card bg-surface shadow-lg border-l-4 px-4 py-3 flex items-start gap-3"
          :class="toneClass[t.tone]"
          role="status"
        >
          <div class="flex-1 min-w-0">
            <p class="text-body font-medium text-text-primary">{{ t.title }}</p>
            <p v-if="t.body" class="text-small text-text-secondary mt-0.5">{{ t.body }}</p>
            <button
              v-if="t.action"
              type="button"
              class="text-small font-medium text-primary mt-1 hover:underline"
              @click="t.action!.onClick(); dismiss(t.id)"
            >{{ t.action!.label }}</button>
          </div>
          <button
            type="button"
            class="h-6 w-6 rounded-input text-text-secondary hover:bg-surface-muted shrink-0"
            aria-label="Dismiss"
            @click="dismiss(t.id)"
          >×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
