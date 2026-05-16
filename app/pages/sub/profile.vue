<!--
  app/pages/sub/profile.vue — back-compat redirect (W3-4 / EH-N /
  ADR-0031). Legacy /sub/profile is now /sub/settings; this stub
  preserves bookmarks.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

await navigateTo('/sub/settings', { replace: true })
</script>

<template>
  <div />
</template>
