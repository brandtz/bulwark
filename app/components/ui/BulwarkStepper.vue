<!--
  BulwarkStepper.vue — multi-step wizard progress indicator.

  Used in Property intake (E3) and Compliance doc generator (E7).

  Decisions
  ---------
  - **Display-only**: doesn't drive routing. Consumer decides what's
    "current" / "complete" / "upcoming".
  - **Horizontal only**: vertical stepper (sidebar of tasks) is a future
    component if needed.
-->
<script setup lang="ts">
type Status = 'complete' | 'current' | 'upcoming' | 'error'
interface Step { label: string; status: Status }
defineProps<{ steps: Step[] }>()

const dotClass: Record<Status, string> = {
  complete: 'bg-status-success text-white border-status-success',
  current: 'bg-primary text-white border-primary',
  upcoming: 'bg-surface text-text-secondary border-border',
  error: 'bg-status-error text-white border-status-error',
}
</script>

<template>
  <ol class="flex items-center gap-2 w-full" aria-label="Progress">
    <li
      v-for="(step, idx) in steps"
      :key="step.label"
      class="flex items-center gap-2 flex-1 min-w-0"
    >
      <span
        class="h-7 w-7 rounded-full border flex items-center justify-center text-small font-semibold shrink-0"
        :class="dotClass[step.status]"
      >
        <template v-if="step.status === 'complete'">✓</template>
        <template v-else>{{ idx + 1 }}</template>
      </span>
      <span
        class="text-small truncate"
        :class="step.status === 'current' ? 'text-text-primary font-medium' : 'text-text-secondary'"
      >{{ step.label }}</span>
      <span
        v-if="idx < steps.length - 1"
        class="flex-1 h-px bg-border"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
