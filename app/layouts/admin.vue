<!--
  app/layouts/admin.vue — Admin shell (Packet A shell/admin.*.html, WP-A5).

  Renders the collapsible AppSidebar (>=md), AppTopBar, main landmark with
  <AppAnnouncements />, legal footer, AppBottomNav (<md, with SH-10 More sheet),
  and BulwarkToastHost. `app/layouts/default.vue` wraps or aliases this shell.
-->
<script setup lang="ts">
const { ensureLoaded } = useSession()
await ensureLoaded()
</script>

<template>
  <div class="min-h-screen bg-background flex" data-testid="admin-layout">
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
      <main
        id="main-content"
        tabindex="-1"
        data-print-root
        class="flex-1 pb-bottom-nav md:pb-0 focus:outline-none"
      >
        <AppAnnouncements />
        <slot />
      </main>
      <footer
        class="no-print border-t border-border bg-surface px-4 py-3 text-tiny text-text-secondary flex flex-wrap items-center justify-between gap-2"
        data-testid="app-legal-footer"
      >
        <div>© 2026 Bulwark</div>
        <nav class="flex gap-3" aria-label="Legal">
          <NuxtLink to="/privacy" class="hover:underline" data-testid="footer-link-privacy">Privacy</NuxtLink>
          <NuxtLink to="/terms" class="hover:underline" data-testid="footer-link-terms">Terms</NuxtLink>
          <NuxtLink to="/dpa" class="hover:underline" data-testid="footer-link-dpa">DPA</NuxtLink>
        </nav>
      </footer>
    </div>
    <AppBottomNav class="no-print" />
    <BulwarkToastHost />
  </div>
</template>
