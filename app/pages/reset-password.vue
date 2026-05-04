<!--
  app/pages/reset-password.vue — set a new password from a reset link.

  Why this file exists
  --------------------
  Companion to /forgot-password. Reads `?token=...` from the query string,
  posts it back together with the new password, and on success the mock
  signs the user in immediately so they don't have to retype.

  Decisions
  ---------
  - **Confirm-password field** lives client-side only (mirror match check).
    Kept off the contract because the backend never needs the duplicate;
    PasswordPolicy only enforces the single field.
  - **Success ⇒ /login with a "now sign in" toast**: forces a fresh sign-in
    after reset (matches what most production apps do, including the future
    RealAuthService). Decision cast down: auto-sign-in via cookie write
    and bounce to `/`. Rejected — it left the new session in a half-loaded
    state where the persistent layout's session ref hadn't refreshed yet,
    and made tests flaky (URL would briefly match a dashboard before the
    redirect chain settled).
  - **Token-missing screen** is a hard error, not a redirect, so users
    realise the link they clicked is broken (vs. silently being told to
    sign in for unrelated reasons).
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Reset password · Bulwark' })

const route = useRoute()
const { resetPassword, logout, loading, error } = useAuth()

const token = computed(() =>
  typeof route.query.token === 'string' ? route.query.token : '',
)

const newPassword = ref('')
const confirmPassword = ref('')
const mismatch = ref(false)

async function submit() {
  mismatch.value = false
  if (newPassword.value !== confirmPassword.value) {
    mismatch.value = true
    return
  }
  const ok = await resetPassword({ token: token.value, newPassword: newPassword.value })
  if (ok) {
    // Force a fresh sign-in: clear the auto-issued session and bounce to
    // /login with a notice flag so the user re-authenticates with the new
    // password. Mirrors how the real backend (E11-S2) will revoke sessions.
    await logout()
    await navigateTo('/login?reset=ok')
  }
}
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <NuxtLink to="/login" class="text-small text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-4">
        <span aria-hidden="true">←</span> Back to sign in
      </NuxtLink>

      <div
        v-if="!token"
        class="bg-surface rounded-card p-6 shadow"
        data-testid="reset-no-token"
      >
        <h1 class="text-h2 text-text-primary">Link invalid</h1>
        <p class="text-small text-text-secondary mt-2">
          This reset link is missing its token. Request a new one from the
          <NuxtLink to="/forgot-password" class="text-primary hover:underline">forgot password</NuxtLink>
          page.
        </p>
      </div>

      <form
        v-else
        class="space-y-4 bg-surface rounded-card p-6 shadow"
        @submit.prevent="submit"
      >
        <h1 class="text-h2 text-text-primary">Set a new password</h1>

        <div
          v-if="error"
          role="alert"
          class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
        >{{ error }}</div>

        <BulwarkInput
          v-model="newPassword"
          type="password"
          label="New password"
          autocomplete="new-password"
          required
        />
        <BulwarkInput
          v-model="confirmPassword"
          type="password"
          label="Confirm new password"
          autocomplete="new-password"
          :error="mismatch ? 'Passwords do not match' : ''"
          required
        />

        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="loading"
          class="w-full"
          data-testid="reset-submit"
        >
          Update password
        </BulwarkButton>
      </form>
    </div>
  </main>
</template>
