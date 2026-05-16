<!--
  app/pages/accept-invite.vue — first-time user finishing an invitation.

  Why this file exists
  --------------------
  E2-S2: completes the "you've been invited" round trip. The token in the
  URL encodes which org + role the new user is joining; this page lets
  them confirm their name and pick a password, then signs them in.

  Decisions
  ---------
  - **Server-validated preview**: before showing the form we hit
    `previewInvite(token)` so the page can render org/role context. If
    the token is bad or expired we render the error state up front
    instead of after the user has typed a password.
  - **Email is read-only**: the invite is bound to the email it was sent
    to. Letting the recipient change it would defeat the invite's purpose.
  - **Password policy mirrors /reset-password**. Field-level confirm match
    is client-side only; backend never needs the duplicate.
  - On success the user lands on `/` because they're now signed in. The
    persistent shell (ADR-0005) takes over from there.

  Decision cast down: render the form first and only validate the token
  on submit. Rejected — feels broken when the user types everything and
  is then told their link is bad.
-->
<script setup lang="ts">
import type { InvitePreview } from '~~/shared/contracts/auth'

definePageMeta({ layout: false })
useHead({ title: 'Accept invitation · Bulwark' })

const route = useRoute()
const { acceptInvite, previewInvite, loading, error } = useAuth()

const token = computed(() =>
  typeof route.query.token === 'string' ? route.query.token : '',
)

const preview = ref<InvitePreview | null>(null)
const previewError = ref<string | null>(null)
const previewLoading = ref(true)

const fullName = ref('')
const password = ref('')
const confirmPassword = ref('')
const mismatch = ref(false)

onMounted(async () => {
  if (!token.value) {
    previewError.value = 'This invitation link is missing its token.'
    previewLoading.value = false
    return
  }
  const p = await previewInvite(token.value)
  if (p) {
    preview.value = p
  } else {
    // useAuth surfaces the message via `error.value`; mirror it so the
    // pre-form screen can show its own banner without depending on
    // submit-state error handling.
    previewError.value = error.value ?? 'This invitation link is invalid or has expired.'
  }
  previewLoading.value = false
})

async function submit() {
  mismatch.value = false
  if (password.value !== confirmPassword.value) {
    mismatch.value = true
    return
  }
  const ok = await acceptInvite({
    token: token.value,
    fullName: fullName.value,
    password: password.value,
  })
  if (ok) {
    // Hard navigation. SPA navigation from a `layout: false` page into a
    // `layout: default` route was leaving the previous page's DOM mounted
    // even though `page.url()` had updated — Nuxt 3.21 / Vue Router 4 race
    // we don't yet fully understand. A full document load lets the layout
    // mount cleanly with the freshly-set cookie session.
    const role = preview.value?.role ?? 'org_admin'
    const dest =
      role === 'super_admin' || role === 'org_admin' || role === 'org_manager'
        ? '/admin/dashboard'
        : role === 'field'
        ? '/field/dashboard'
        : role === 'sub_contractor'
        ? '/sub'
        : role === 'homeowner'
        ? '/homeowner'
        : '/admin/dashboard'
    if (typeof window !== 'undefined') window.location.assign(dest)
    else await navigateTo(dest)
  }
}
</script>

<template>
  <main class="min-h-screen bg-surface-muted flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div
        v-if="previewLoading"
        class="bg-surface rounded-card p-6 shadow"
      >
        <p class="text-small text-text-secondary">Checking invitation…</p>
      </div>

      <div
        v-else-if="previewError"
        class="bg-surface rounded-card p-6 shadow"
        data-testid="invite-error"
      >
        <h1 class="text-h2 text-text-primary">Invitation problem</h1>
        <p class="text-small text-text-secondary mt-2">{{ previewError }}</p>
        <NuxtLink
          to="/login"
          class="mt-4 inline-block text-small text-primary hover:underline"
        >Go to sign in</NuxtLink>
      </div>

      <form
        v-else-if="preview"
        class="space-y-4 bg-surface rounded-card p-6 shadow"
        @submit.prevent="submit"
      >
        <h1 class="text-h2 text-text-primary">Accept invitation</h1>
        <p
          class="text-small text-text-secondary"
          data-testid="invite-summary"
        >
          You've been invited to join
          <span class="font-medium text-text-primary">{{ preview.organizationName }}</span>
          as <span class="font-medium text-text-primary">{{ preview.role }}</span>.
        </p>

        <div
          v-if="error"
          role="alert"
          class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
        >{{ error }}</div>

        <BulwarkInput
          :model-value="preview.email"
          type="email"
          label="Email"
          autocomplete="email"
          disabled
        />
        <BulwarkInput
          v-model="fullName"
          type="text"
          label="Full name"
          autocomplete="name"
          required
        />
        <BulwarkInput
          v-model="password"
          type="password"
          label="Password"
          autocomplete="new-password"
          required
        />
        <BulwarkInput
          v-model="confirmPassword"
          type="password"
          label="Confirm password"
          autocomplete="new-password"
          :error="mismatch ? 'Passwords do not match' : ''"
          required
        />

        <BulwarkButton
          type="submit"
          variant="primary"
          :loading="loading"
          class="w-full"
          data-testid="invite-submit"
        >
          Create account
        </BulwarkButton>
      </form>
    </div>
  </main>
</template>
