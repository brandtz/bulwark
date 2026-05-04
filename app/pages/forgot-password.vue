<!--
  app/pages/forgot-password.vue — request a password-reset link.

  Why this file exists
  --------------------
  E2-S2: closes the "I forgot my password" loop in the demo. The page calls
  `requestPasswordReset(email)` and always shows a success-shaped message
  back to the user — even when the email is unknown — to avoid leaking
  account existence.

  Decisions
  ---------
  - **Standalone layout** (`layout: false`): same shell-less treatment as
    /login. Pre-auth pages share aesthetics, not chrome.
  - **Always show success state**: enumeration-resistant by design. The
    real backend (E11-S2) will fire-and-forget the actual send and respond
    identically.
  - **Dev-only "Open reset link" affordance**: when running mock-backed,
    `requestPasswordReset()` returns a `devToken`. We render that as a
    clickable link to /reset-password?token=... so sponsors / Playwright
    don't need a working SMTP mock.
    Decision cast down: print the token to a toast. Rejected because the
    happy path is "click → land on next screen", and a copy/paste step
    would have made the demo feel broken.
  - No "Sign in" hyperlink here yet — the back-arrow / browser back covers
    it. Adding cross-links between auth pages lands when E2-S5 (UserMenu)
    introduces a shared AuthCard surface.
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Forgot password · Bulwark' })

const { requestPasswordReset, loading, error } = useAuth()

const email = ref('')
const submitted = ref(false)
const devToken = ref<string | null>(null)

async function submit() {
  if (!email.value) return
  const r = await requestPasswordReset({ email: email.value })
  if (r.ok) {
    submitted.value = true
    devToken.value = r.devToken
  }
}

const showDevHint = import.meta.dev
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <NuxtLink to="/login" class="text-small text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-4">
        <span aria-hidden="true">←</span> Back to sign in
      </NuxtLink>

      <div
        v-if="!submitted"
        class="bg-surface rounded-card p-6 shadow"
      >
        <h1 class="text-h2 text-text-primary">Forgot password</h1>
        <p class="text-small text-text-secondary mt-1 mb-4">
          Enter your email and we'll send a reset link.
        </p>

        <form class="space-y-4" @submit.prevent="submit">
          <div
            v-if="error"
            role="alert"
            class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
          >{{ error }}</div>

          <BulwarkInput
            v-model="email"
            type="email"
            label="Email"
            placeholder="you@company.com"
            autocomplete="email"
            required
          />

          <BulwarkButton
            type="submit"
            variant="primary"
            :loading="loading"
            class="w-full"
            data-testid="forgot-submit"
          >
            Send reset link
          </BulwarkButton>
        </form>
      </div>

      <div
        v-else
        class="bg-surface rounded-card p-6 shadow"
        data-testid="forgot-success"
      >
        <h1 class="text-h2 text-text-primary">Check your email</h1>
        <p class="text-small text-text-secondary mt-2">
          If an account exists for <span class="font-medium text-text-primary">{{ email }}</span>,
          we just sent a link to reset the password. The link expires in one hour.
        </p>

        <div
          v-if="showDevHint && devToken"
          class="mt-5 rounded-input border border-border bg-surface-muted px-3 py-3"
        >
          <p class="text-tiny text-text-secondary mb-2">
            Mock backend (no real email): use this convenience link to continue.
          </p>
          <NuxtLink
            :to="`/reset-password?token=${devToken}`"
            class="text-small text-primary hover:underline break-all"
            data-testid="dev-reset-link"
          >
            Open reset link
          </NuxtLink>
        </div>
      </div>
    </div>
  </main>
</template>
