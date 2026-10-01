<!--
  BulwarkToastHost.vue — renders useToast() (Packet A components/SPEC.md, WP-A2).

  One per layout. `position` defaults by breakpoint (SPEC): top on phones
  (clear of the bottom nav and the thumb zone), bottom-right from 768px.
  At most `max` toasts show (newest kept); older ones wait their turn rather
  than stacking off-screen. The region is a polite live region; error toasts
  are role=alert inside it.
-->
<script setup lang="ts">
interface Props {
  position?: 'bottom-right' | 'top'
  max?: number
}
const props = withDefaults(defineProps<Props>(), { position: undefined, max: 3 })

const { toasts, dismiss } = useToast()
const shown = computed(() => toasts.value.slice(-props.max))
</script>

<template>
  <Teleport to="body">
    <div
      class="bw-toast-host"
      :class="position ? `bw-toast-host--${position}` : 'bw-toast-host--auto'"
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
        <BulwarkToast
          v-for="t in shown"
          :key="t.id"
          class="pointer-events-auto"
          :tone="t.tone"
          :title="t.title"
          :body="t.body"
          :action="t.action ? { label: t.action.label, fn: t.action.onClick } : null"
          :persistent="t.duration === 0"
          :duration="t.duration"
          @action="dismiss(t.id)"
          @dismiss="dismiss(t.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
.bw-toast-host {
  position: fixed; z-index: var(--z-toast); display: flex; flex-direction: column; gap: 8px;
  padding: 16px; pointer-events: none; width: 100%;
}
.bw-toast-host--top, .bw-toast-host--auto { top: 0; left: 0; align-items: center; }
.bw-toast-host--bottom-right { bottom: 0; right: 0; width: auto; align-items: flex-end; }
@media (min-width: 768px) {
  .bw-toast-host--auto { top: auto; left: auto; bottom: 0; right: 0; width: auto; align-items: flex-end; }
}
</style>
