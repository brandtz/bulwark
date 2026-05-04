<!--
  pages/403.vue — friendly forbidden page (E2-S3, refined further in E2-S5).

  # Decisions (ADR-0008)

  - **`layout: false`**: the persistent app shell shouldn't render around
    a permission failure — sidebar links to areas the user can't reach
    are confusing, not helpful. A clean centered card with a clear path
    forward is the right primitive. The full styled error pages (404 +
    403 + 500) all share this pattern in E2-S5.
  - **`back-button` and `home-button` data-testids** so the Playwright
    persona matrix in E2-S7 can assert recovery paths exist.

  # Decision cast down

  - **Auto-redirect to the user's home dashboard after N seconds**.
    Rejected — feels disorienting and hides the security signal. Show
    the message, let the user click out.
-->

<script setup lang="ts">
definePageMeta({ layout: false })

const { session, ensureLoaded } = useSession()
// /403 is public (auth.global skips it), so we have to hydrate the session
// here ourselves — otherwise the page would always render the "you need
// to sign in" branch even for already-authed users who hit a forbidden
// route.
await ensureLoaded()
const router = useRouter()

function goHome() {
  // Hand off to `/` — index.vue does role-aware redirect.
  return navigateTo('/')
}

function goBack() {
  if (window.history.length > 1) router.back()
  else void goHome()
}
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div
      class="w-full max-w-md bg-surface rounded-card p-8 shadow text-center"
      data-testid="forbidden-card"
    >
      <p class="text-tiny font-mono text-text-secondary tracking-widest">403</p>
      <h1 class="mt-2 text-h1 text-text-primary">Not your turf</h1>
      <p class="mt-3 text-body text-text-secondary">
        <template v-if="session">
          Your account ({{ session.activeRole }}) doesn't have access to that
          page. Ask an admin if you think this is a mistake.
        </template>
        <template v-else>
          You need to sign in to view that page.
        </template>
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
  </main>
</template>
