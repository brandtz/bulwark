<!--
  app/pages/profile.vue — common profile page (E10-S3).

  # Decisions (ADR-0008)
    - Cross-role page: the nav config exposes /profile to every
      authenticated role. v1 is read-only — name, email, active
      organization, role badge, sign-out CTA.
    - Editing (avatar upload, password change, MFA enrol) lands
      in E11 with the real auth backend.

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

    <BulwarkCard padding="md" class="mt-4" data-testid="profile-coming-soon">
      <p class="text-body font-medium">More coming with the real backend (E11)</p>
      <p class="text-small text-text-secondary mt-1">
        Avatar upload, password change, and MFA enrolment land when the
        production auth service is wired in.
      </p>
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
