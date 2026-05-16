<!--
  app/pages/sub/settings.vue — settings landing for sub-contractor
  users (W3-4 / EH-N / ADR-0031). Surfaces the sub's profile +
  attached users so an admin can see who can sign in for the sub.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

useHead({ title: 'Settings' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const sub = useService('subcontractor')

const subId = ref<string | null>(null)
const users = ref<Awaited<ReturnType<typeof sub.listUsers>>>([])

if (orgId.value && userId.value) {
  const resolved = await sub.resolveSubForUser(userId.value, orgId.value)
  subId.value = resolved?.subcontractorId ?? null
  if (subId.value) {
    users.value = await sub.listUsers(subId.value, orgId.value)
  }
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="sub-settings">
    <h1 class="text-display">Settings</h1>
    <p class="text-body text-text-secondary mt-1">Who can sign in for your team.</p>

    <ul v-if="users.length" class="mt-4 space-y-2" data-testid="sub-users-list">
      <li v-for="u in users" :key="u.id" :data-testid="`sub-user-${u.id}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ u.fullName || u.email }}</p>
          <p class="text-small text-text-secondary mt-1">{{ u.email }}</p>
        </BulwarkCard>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="sub-settings-empty"
      title="No users yet"
      body="Ask an admin to invite teammates from your sub-contractor record."
    />
  </div>
</template>
