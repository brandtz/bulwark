<!--
  app/error.vue — global error page (E2-S6).

  Nuxt invokes this for unhandled errors AND for unmatched routes (the
  built-in 404). We branch on `error.statusCode` to render distinct
  copy / testids for 404 vs 500-class failures, and reuse the same
  centered-card primitive that /403 already established.

  # Decisions (ADR-0008)

  - **Single `error.vue`, branched by status code**: per Nuxt 3 docs,
    one root error component handles every uncaught error and unknown
    route. We keep the surface area tiny and let the visible copy /
    testids ('not-found-card', 'server-error-card') be the contract.
  - **No persistent app shell on the error page**: same call as `/403`.
    The sidebar would tease pages the user already can't get to — we
    show a clean recovery card.
  - **`clearError({ redirect })` on Go-home / Back**: required by Nuxt
    or the error state sticks even after navigation succeeds.
  - **`createError({ statusCode: 500, fatal: true })` test affordance**:
    a `/dev/throw` route in dev mode lets the Playwright spec exercise
    the 500 branch deterministically (production never exposes it).

  # Decision cast down

  - **Separate `404.vue` / `500.vue` pages**: rejected. Nuxt's
    `error.vue` is the canonical single entry point; routing a
    catch-all just to render a 404 page duplicates the affordance.
  - **Auto-redirect after N seconds**: rejected for the same reason as
    `/403` — hides the signal, surprises the user.
-->

<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()

const router = useRouter()

async function goHome() {
  // `clearError({ redirect })` resets the error state AND navigates so
  // the destination doesn't immediately re-render the error page.
  await clearError({ redirect: '/' })
}

async function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    await clearError()
    router.back()
  } else {
    await goHome()
  }
}
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div
      v-if="error.statusCode === 404"
      class="w-full max-w-md bg-surface rounded-card p-8 shadow text-center"
      data-testid="not-found-card"
    >
      <p class="text-tiny font-mono text-text-secondary tracking-widest">404</p>
      <h1 class="mt-2 text-h1 text-text-primary">Lost the trail</h1>
      <p class="mt-3 text-body text-text-secondary">
        We couldn't find that page. It may have been moved, archived, or
        never existed.
      </p>
      <div class="mt-6 flex flex-col gap-2">
        <BulwarkButton
          variant="primary"
          class="w-full"
          data-testid="home-button"
          @click="goHome"
        >Go to my dashboard</BulwarkButton>
        <BulwarkButton
          variant="ghost"
          class="w-full"
          data-testid="back-button"
          @click="goBack"
        >Back</BulwarkButton>
      </div>
    </div>

    <div
      v-else
      class="w-full max-w-md bg-surface rounded-card p-8 shadow text-center"
      data-testid="server-error-card"
    >
      <p class="text-tiny font-mono text-text-secondary tracking-widest">{{ error.statusCode || 500 }}</p>
      <h1 class="mt-2 text-h1 text-text-primary">Something went sideways</h1>
      <p class="mt-3 text-body text-text-secondary">
        We hit an unexpected error. The team has been notified — please
        try again, or head back to your dashboard.
      </p>
      <p
        v-if="error.message"
        class="mt-3 text-tiny font-mono text-text-secondary break-words"
        data-testid="server-error-detail"
      >{{ error.message }}</p>
      <div class="mt-6 flex flex-col gap-2">
        <BulwarkButton
          variant="primary"
          class="w-full"
          data-testid="home-button"
          @click="goHome"
        >Go to my dashboard</BulwarkButton>
        <BulwarkButton
          variant="ghost"
          class="w-full"
          data-testid="back-button"
          @click="goBack"
        >Back</BulwarkButton>
      </div>
    </div>
  </main>
</template>
