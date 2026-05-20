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

// --- Avatar upload --------------------------------------------------------
// Client-side resize-to-256-square via <canvas>, encode as JPEG data URL,
// POST to /api/account/avatar which validates + persists into users.avatar_url.
// We then refresh the session so the new URL surfaces in the nav.
const { refresh: refreshSession } = useSession()
const avatarFile = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
const avatarError = ref('')
const initials = computed(() => {
  const name = session.value?.fullName ?? ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
})

function pickAvatar() {
  avatarError.value = ''
  avatarFile.value?.click()
}

async function resizeToDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    // Center-crop to a square, then draw into the canvas.
    const srcSize = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - srcSize) / 2
    const sy = (bitmap.height - srcSize) / 2
    ctx.drawImage(bitmap, sx, sy, srcSize, srcSize, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    bitmap.close?.()
  }
}

async function onAvatarChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    avatarError.value = 'Choose a PNG, JPEG, or WEBP image'
    return
  }
  avatarBusy.value = true
  avatarError.value = ''
  try {
    const dataUrl = await resizeToDataUrl(file)
    await $fetch('/api/account/avatar', { method: 'POST', body: { dataUrl } })
    await refreshSession()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    avatarError.value = msg.replace(/^.*?:\s*/, '')
  } finally {
    avatarBusy.value = false
  }
}

async function onAvatarRemove() {
  avatarBusy.value = true
  avatarError.value = ''
  try {
    await $fetch('/api/account/avatar', { method: 'POST', body: { dataUrl: null } })
    await refreshSession()
  } catch (err) {
    avatarError.value = err instanceof Error ? err.message : 'Could not remove avatar'
  } finally {
    avatarBusy.value = false
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

    <BulwarkCard padding="md" class="mt-4" data-testid="profile-avatar">
      <div class="flex items-center gap-4">
        <div
          class="h-16 w-16 rounded-full bg-surface-muted/60 border border-border-default overflow-hidden flex items-center justify-center text-text-secondary text-body font-medium"
          data-testid="profile-avatar-preview"
        >
          <img
            v-if="session?.avatarUrl"
            :src="session.avatarUrl"
            alt="Avatar"
            class="h-full w-full object-cover"
          >
          <span v-else>{{ initials }}</span>
        </div>
        <div class="flex-1">
          <p class="text-body font-medium">Profile photo</p>
          <p class="text-small text-text-secondary mt-1">
            PNG, JPEG, or WEBP. Resized to 256×256 on upload.
          </p>
          <div
            v-if="avatarError"
            role="alert"
            data-testid="profile-avatar-error"
            class="mt-2 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-1.5 text-small text-status-error"
          >{{ avatarError }}</div>
        </div>
        <div class="flex flex-col gap-2">
          <BulwarkButton
            variant="primary"
            :loading="avatarBusy"
            :disabled="avatarBusy"
            data-testid="profile-avatar-upload"
            @click="pickAvatar"
          >
            {{ session?.avatarUrl ? 'Change' : 'Upload' }}
          </BulwarkButton>
          <BulwarkButton
            v-if="session?.avatarUrl"
            variant="secondary"
            :disabled="avatarBusy"
            data-testid="profile-avatar-remove"
            @click="onAvatarRemove"
          >
            Remove
          </BulwarkButton>
        </div>
        <input
          ref="avatarFile"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="hidden"
          data-testid="profile-avatar-input"
          @change="onAvatarChange"
        >
      </div>
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

    <BulwarkCard padding="md" class="mt-4" data-testid="profile-security-link">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-body font-medium">Two-factor authentication</p>
          <p class="text-small text-text-secondary mt-1">
            Add an authenticator app and backup codes to protect your account.
          </p>
        </div>
        <NuxtLink
          to="/profile/security"
          class="inline-flex items-center rounded-input border border-border-default px-3 py-1.5 text-small text-text-primary bg-surface hover:bg-surface-muted/40"
          data-testid="profile-security-nav"
        >
          Manage
        </NuxtLink>
      </div>
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
