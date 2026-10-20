<!--
  app/layouts/settings.vue — Settings shell with secondary navigation (Packet A shell/settings.*.html, WP-A5).
-->
<script setup lang="ts">
const { ensureLoaded } = useSession()
await ensureLoaded()
const route = useRoute()

const SETTINGS_NAV = [
  { label: 'Overview', to: '/settings' },
  { label: 'Company', to: '/settings/company' },
  { label: 'Branding', to: '/settings/branding' },
  { label: 'Labels', to: '/settings/labels' },
  { label: 'Pipelines', to: '/settings/pipelines' },
  { label: 'Trades', to: '/settings/trades' },
  { label: 'Programs', to: '/settings/programs' },
  { label: 'Inspection templates', to: '/settings/inspection-templates' },
  { label: 'Users & roles', to: '/settings/users' },
  { label: 'Permissions', to: '/settings/permissions' },
  { label: 'Security', to: '/settings/security' },
  { label: 'Providers', to: '/settings/providers' },
  { label: 'API keys', to: '/settings/api-keys' },
  { label: 'Webhooks', to: '/settings/webhooks' },
  { label: 'Audit log', to: '/settings/audit-log' },
]
</script>

<template>
  <div class="min-h-screen bg-background flex" data-testid="settings-layout">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-primary focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>
    <AppSidebar class="no-print" />
    <div class="flex-1 flex flex-col min-w-0">
      <AppTopBar class="no-print" />
      <div class="flex-1 flex flex-col md:flex-row min-w-0">
        <nav
          class="no-print hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-surface p-3 gap-1"
          aria-label="Settings sections"
          data-testid="settings-secondary-nav"
        >
          <NuxtLink
            v-for="item in SETTINGS_NAV"
            :key="item.to"
            :to="item.to"
            :aria-current="route.path === item.to ? 'page' : undefined"
            class="px-3 py-2 rounded text-small transition-colors"
            :class="route.path === item.to ? 'bg-surface-muted font-semibold text-primary' : 'text-text-secondary hover:text-text-primary'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <main
          id="main-content"
          tabindex="-1"
          data-print-root
          class="flex-1 pb-bottom-nav md:pb-0 focus:outline-none min-w-0"
        >
          <AppAnnouncements />
          <slot />
        </main>
      </div>
    </div>
    <AppBottomNav class="no-print" />
    <BulwarkToastHost />
  </div>
</template>
