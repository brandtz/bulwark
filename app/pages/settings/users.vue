<!--
  app/pages/settings/users.vue — users + memberships viewer (E9-S2).

  # Decisions (ADR-0008)
    - Read-only viewer for v1, sourced from the fixture user roster
      so the sponsor can see "this is where Drew adds his crew".
      Editable invite + role-change UX lands when the real backend
      is wired (E11).

  # Decision cast down
    - Rejected: a placeholder invite form. A submit that doesn't
      actually invite would be misleading; better to surface the
      gap honestly.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import {
  FIXTURE_USER_ADMIN,
  FIXTURE_USER_FIELD,
  FIXTURE_USER_SUB,
  FIXTURE_USER_SUPER,
} from '~~/shared/mocks/fixtures'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Users & roles' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

interface UserRow {
  fullName: string
  email: string
  role: string
}

const users = computed<UserRow[]>(() => {
  const all = [
    FIXTURE_USER_ADMIN,
    FIXTURE_USER_FIELD,
    FIXTURE_USER_SUB,
    FIXTURE_USER_SUPER,
  ]
  const out: UserRow[] = []
  for (const u of all) {
    const membership = u.memberships.find((m) => m.organizationId === orgId.value)
    if (!membership) continue
    out.push({
      fullName: u.fullName,
      email: u.email,
      role: membership.role,
    })
  }
  return out
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-users">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Users & roles' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Users & roles</h1>
      <p class="text-body text-text-secondary mt-1">
        Members of this organization and their roles.
      </p>
    </header>

    <BulwarkCard padding="none" class="mt-6">
      <ul class="divide-y divide-border-default">
        <li
          v-for="u in users"
          :key="u.email"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="user-row"
        >
          <div class="md:col-span-6">
            <p class="text-body font-medium text-text-primary">{{ u.fullName }}</p>
            <p class="text-small text-text-secondary">{{ u.email }}</p>
          </div>
          <div class="md:col-span-6 md:text-right text-small">
            <span class="inline-flex items-center rounded-pill bg-status-info/10 text-status-info px-2.5 py-1 text-tiny font-medium">
              {{ u.role }}
            </span>
          </div>
        </li>
      </ul>
    </BulwarkCard>

    <BulwarkCard padding="md" class="mt-4" data-testid="users-coming-soon">
      <p class="text-body font-medium">Invitations land in Epic E11</p>
      <p class="text-small text-text-secondary mt-1">
        Invite a crew member, change their role, or revoke access — once the
        real backend is wired up.
      </p>
    </BulwarkCard>
  </div>
</template>
