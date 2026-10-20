<!--
  app/layouts/stakeholder.vue — External stakeholder read-only shell (Packet A shell/stakeholder.*.html, WP-A5).

  Renders a persistent read-only banner (`BulwarkBanner tone="readonly"`),
  topbar with Portfolio / Reports links, and main content with <AppAnnouncements />.
  Invariant: zero elements with `data-action="write"` exist inside the stakeholder shell.
-->
<script setup lang="ts">
const { session, ensureLoaded } = useSession()
await ensureLoaded()
const route = useRoute()
const isPortalRoute = computed(() => route.path === '/insurer' || route.path.startsWith('/insurer/'))

const orgName = computed(() => {
  if (!session.value) return 'Bulwark'
  return (
    session.value.memberships.find((m) => m.organizationId === session.value!.activeOrganizationId)?.organizationName ??
    session.value.memberships[0]?.organizationName ??
    'Bulwark'
  )
})
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col" data-testid="stakeholder-layout">
    <a
      href="#stakeholder-main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-primary focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>

    <BulwarkBanner tone="readonly" data-testid="stakeholder-readonly-banner">
      Viewing {{ orgName }} · Read-only stakeholder access
    </BulwarkBanner>

    <header
      class="h-topbar bg-surface border-b border-border flex items-center px-4 md:px-8 gap-4 sticky top-0 z-20"
      data-testid="stakeholder-header"
    >
      <div class="w-8 h-8 rounded-card bg-primary flex items-center justify-center font-bold text-white shrink-0">
        {{ orgName.slice(0, 1).toUpperCase() }}
      </div>
      <span class="font-semibold text-small truncate">{{ orgName }}</span>
      <nav v-if="isPortalRoute" class="flex gap-2 ml-4" aria-label="Primary">
        <NuxtLink to="/insurer/portfolio" class="bw-btn bw-btn--ghost bw-btn--sm">Portfolio</NuxtLink>
        <NuxtLink to="/insurer/reports" class="bw-btn bw-btn--ghost bw-btn--sm">Reports</NuxtLink>
      </nav>
      <span class="flex-1" />
      <UserMenu />
    </header>

    <main
      id="stakeholder-main"
      tabindex="-1"
      class="flex-1 p-4 md:p-8 focus:outline-none"
    >
      <AppAnnouncements />
      <slot />
    </main>

    <BulwarkToastHost />
  </div>
</template>
