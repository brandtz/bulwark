<!--
  app/pages/sub/dashboard.vue — back-compat redirect (W3-4 / EH-N /
  ADR-0031). The legacy sub landing page was /sub/dashboard; the new
  portal home is /sub. We keep this stub so bookmarks and the legacy
  invite-flow URLs (pre-W3-4) keep working.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

await navigateTo('/sub', { replace: true })
</script>

<template>
  <div />
</template>
