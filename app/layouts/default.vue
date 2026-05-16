<!--
  layouts/default.vue — the SINGLE authenticated app layout.

  Per ADR-0005:
    - This is the ONLY file allowed to render persistent navigation.
    - Pages render into <slot /> via <NuxtPage>.
    - Per-page custom chrome opts into a different layout (auth, public,
      fullscreen) — those land in E2-S1 and E10-S1.

  This file ensures the demo's "sidebar appears on some pages and not others"
  failure mode is structurally impossible.
-->
<script setup lang="ts">
const { ensureLoaded } = useSession()
// Best-effort: ensures the session is hydrated before child pages render.
// We don't await server-side because the mock auth resolves synchronously;
// when the real backend lands (E11) this becomes a server-side fetch.
await ensureLoaded()
</script>

<template>
  <div class="min-h-screen bg-background flex">
    <!--
      W2-6 / EH-L a11y: skip-to-content link. Must be the first
      interactive element so a keyboard user lands on it on first Tab.
      Visible on focus only (`sr-only focus:not-sr-only`).
    -->
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
        <slot />
      </main>
      <!--
        W5-4 (ADR-0038): legal links footer. Required so authenticated
        users can reach the privacy / terms / DPA pages without going
        through the marketing site. `no-print` keeps the footer out of
        compliance-document PDFs.
      -->
      <footer
        class="no-print border-t border-border bg-surface px-4 py-3 text-tiny text-text-secondary flex flex-wrap items-center justify-between gap-2"
        data-testid="app-legal-footer"
      >
        <div>© {{ new Date().getFullYear() }} Bulwark</div>
        <nav class="flex gap-3">
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
