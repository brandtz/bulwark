<!--
  AppTopBar.vue — top bar with breadcrumbs (slot), org switcher, user menu.

  Visible on every authenticated page. Per ADR-0005, the only place
  these chrome elements may render.
-->
<script setup lang="ts">
const { session } = useSession()

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

    <!--
      Org switcher chip. For users with >1 membership it's a NuxtLink to
      /org-switcher. For single-org users it stays a static label so we
      don't tease an action that isn't actionable.
    -->
    <NuxtLink
      v-if="(session?.memberships?.length ?? 0) > 1"
      to="/org-switcher"
      class="hidden sm:flex items-center px-3 py-1.5 rounded text-small text-text-primary border border-border bg-background hover:border-primary"
      data-testid="org-switcher"
    >
      <span class="truncate max-w-[14rem]">{{ orgName }}</span>
      <span class="ml-2 text-text-secondary">▾</span>
    </NuxtLink>
    <div
      v-else
      class="hidden sm:flex items-center px-3 py-1.5 rounded text-small text-text-secondary border border-border bg-background"
      data-testid="org-switcher"
    >
      {{ orgName }}
    </div>

    <!-- User chip + dropdown (E2-S5). The UserMenu owns logout-button. -->
    <UserMenu />
  </header>
</template>
