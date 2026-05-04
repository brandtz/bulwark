<!--
  AppTopBar.vue — top bar with breadcrumbs (slot), org switcher, user menu.

  Visible on every authenticated page. Per ADR-0005, the only place
  these chrome elements may render.
-->
<script setup lang="ts">
const { session } = useSession()

const initials = computed(() => {
  const n = session.value?.fullName ?? ''
  return n.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
})

const orgName = computed(() => {
  if (!session.value) return ''
  return session.value.memberships.find(m => m.organizationId === session.value!.activeOrganizationId)?.organizationName
    ?? session.value.memberships[0]?.organizationName ?? ''
})
</script>

<template>
  <header class="h-topbar bg-surface border-b border-border flex items-center px-4 gap-4 sticky top-0 z-20">
    <!-- Breadcrumb / page title slot. Pages set via useHead title; we
         show that as a fallback. The breadcrumbs component lands in E1-S5. -->
    <div class="flex-1 flex items-center min-w-0">
      <slot name="breadcrumbs">
        <span class="text-body text-text-primary truncate">{{ orgName }}</span>
      </slot>
    </div>

    <!-- Org switcher (placeholder; full impl E2-S5) -->
    <div
      class="hidden sm:flex items-center px-3 py-1.5 rounded text-small text-text-secondary border border-border bg-background"
      data-testid="org-switcher"
    >
      {{ orgName }}
    </div>

    <!-- User chip -->
    <div class="flex items-center gap-2" data-testid="user-menu">
      <div class="w-8 h-8 rounded-full bg-primary text-white text-small font-semibold flex items-center justify-center">
        {{ initials }}
      </div>
      <div class="hidden sm:block">
        <div class="text-small text-text-primary leading-tight">{{ session?.fullName }}</div>
        <div class="text-tiny text-text-secondary leading-tight">{{ session?.activeRole }}</div>
      </div>
    </div>
  </header>
</template>
