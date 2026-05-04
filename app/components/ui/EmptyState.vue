<!--
  EmptyState.vue — "no results" / "no items yet" screen primitive.

  Why this component exists
  -------------------------
  Every list page in Bulwark needs an empty state — Properties (no leads),
  Work Orders (no jobs), Invoices (none generated), Compliance (no docs).
  Without a shared component teams ship different placeholder text and
  different layouts. Boring is the goal.
-->
<script setup lang="ts">
interface CTA { label: string; to: string }
interface Props {
  title: string
  body?: string
  /** A single icon character or short emoji-free glyph; visual hierarchy only. */
  icon?: string
  cta?: CTA | null
}
withDefaults(defineProps<Props>(), { body: '', icon: '·', cta: null })
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-12 px-4">
    <span
      class="h-12 w-12 rounded-full bg-surface-muted text-text-disabled flex items-center justify-center text-2xl mb-4"
      aria-hidden="true"
    >{{ icon }}</span>
    <h2 class="text-h2 text-text-primary">{{ title }}</h2>
    <p v-if="body" class="text-body text-text-secondary mt-2 max-w-md">{{ body }}</p>
    <NuxtLink
      v-if="cta"
      :to="cta.to"
      class="mt-6 inline-flex h-input items-center rounded-input bg-primary px-4 text-body font-medium text-white hover:bg-primary-700 transition"
    >
      {{ cta.label }}
    </NuxtLink>
  </div>
</template>
