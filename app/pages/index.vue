<!--
  pages/index.vue — redirects to the active role's home.

  Until E2 lands the real auth, the mock plugin defaults to FIXTURE_USER_ADMIN
  (org_admin role), so this redirects to /admin/dashboard. When E2 ships, an
  unauthenticated visit redirects to /login instead.
-->
<script setup lang="ts">
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const target = computed(() => {
  switch (session.value?.activeRole) {
    case 'super_admin':
    case 'org_admin':
    case 'org_manager':
      return '/admin/dashboard'
    case 'field':
      return '/field/dashboard'
    case 'sub_contractor':
      return '/sub'
    case 'homeowner':
      return '/homeowner'
    default:
      return '/admin/dashboard'
  }
})

await navigateTo(target.value, { replace: true })
</script>

<template>
  <div />
</template>
