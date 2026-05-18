<!--
  app/pages/profile.vue — common profile page (E10-S3).

  # Decisions (ADR-0008)
    - Cross-role page: the nav config exposes /profile to every
      authenticated role. v1 is read-only — name, email, active
      organization, role badge, sign-out CTA.
    - E11: password change wired to RealAuthService.changePassword.
      Avatar upload and MFA enrolment land alongside (R2 client +
      users.totp_secret column).

  # Decision cast down
    - Rejected: per-role profile pages. The data is identical
      across roles; one page keeps the affordance discoverable
      without forking layouts.
-->
<script setup lang="ts">
definePageMeta({
  // No requiredRoles — `auth.global.ts` already enforces a session;
  // any logged-in user can view their own profile.
})

useHead({ title: 'Profile' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const auth = useService('auth')
const router = useRouter()

const activeOrgName = computed(() => {
  const orgId = session.value?.activeOrganizationId
  return (
    session.value?.memberships.find((m) => m.organizationId === orgId)
      ?.organizationName ?? '—'
  )
})

const signingOut = ref(false)

async function onSignOut() {
  signingOut.value = true
  try {
    await auth.logout()
    await router.push('/login')
  } finally {
    signingOut.value = false
  }
}

// --- Change password ------------------------------------------------------
// Three-field form: current / new / confirm. Submit calls
// auth.changePassword which re-verifies the current password server-side
// and writes a fresh bcrypt hash. We clear the inputs on success and show
// a transient banner; the session stays valid (no re-login needed).
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwError = ref('')
const pwSuccess = ref(false)
const pwSubmitting = ref(false)
const pwMismatch = computed(
  () => confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value,
)

async function onChangePassword() {
  pwError.value = ''
  pwSuccess.value = false
  if (pwMismatch.value) {
    pwError.value = 'Passwords do not match'
    return
  }
  if (newPassword.value.length < 8) {
    pwError.value = 'Password must be at least 8 characters'
    return
  }
  pwSubmitting.value = true
  try {
    await auth.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    pwSuccess.value = true
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    pwError.value = err instanceof Error ? err.message : 'Could not change password'
  } finally {
    pwSubmitting.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto" data-testid="profile-page">
    <header>
      <h1 class="text-display">Profile</h1>
      <p class="text-body text-text-secondary mt-1">
        Your account and active organization.
      </p>
    </header>

    <BulwarkCard padding="md" class="mt-6" data-testid="profile-summary">
      <dl class="flex flex-col gap-3 text-body">
        <div class="flex justify-between">
          <dt class="text-text-secondary">Name</dt>
          <dd>{{ session?.fullName ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Email</dt>
          <dd>{{ session?.email ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Organization</dt>
          <dd>{{ activeOrgName }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-text-secondary">Role</dt>
          <dd>{{ session?.activeRole ?? '—' }}</dd>
        </div>
      </dl>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-4" data-testid="profile-change-password">
      <form class="space-y-3" @submit.prevent="onChangePassword">
        <div>
          <p class="text-body font-medium">Change password</p>
          <p class="text-small text-text-secondary mt-1">
            Enter your current password and a new one (8 characters minimum).
          </p>
        </div>

        <div
          v-if="pwError"
          role="alert"
          data-testid="profile-pw-error"
          class="rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
        >{{ pwError }}</div>
        <div
          v-if="pwSuccess"
          role="status"
          data-testid="profile-pw-success"
          class="rounded-input border border-status-success/30 bg-status-success/5 px-3 py-2 text-small text-status-success"
        >Password updated.</div>

        <BulwarkInput
          v-model="currentPassword"
          type="password"
          label="Current password"
          autocomplete="current-password"
          required
          data-testid="profile-current-password"
        />
        <BulwarkInput
          v-model="newPassword"
          type="password"
          label="New password"
          autocomplete="new-password"
          required
          data-testid="profile-new-password"
        />
        <BulwarkInput
          v-model="confirmPassword"
          type="password"
          label="Confirm new password"
          autocomplete="new-password"
          :error="pwMismatch ? 'Passwords do not match' : ''"
          required
          data-testid="profile-confirm-password"
        />

        <div class="flex justify-end">
          <BulwarkButton
            type="submit"
            variant="primary"
            :loading="pwSubmitting"
            :disabled="pwSubmitting || pwMismatch || !currentPassword || !newPassword"
            data-testid="profile-pw-submit"
          >
            Update password
          </BulwarkButton>
        </div>
      </form>
    </BulwarkCard>

    <div class="mt-6 flex justify-end">
      <BulwarkButton
        variant="secondary"
        :disabled="signingOut"
        data-testid="profile-sign-out"
        @click="onSignOut"
      >
        {{ signingOut ? 'Signing out…' : 'Sign out' }}
      </BulwarkButton>
    </div>
  </div>
</template>
