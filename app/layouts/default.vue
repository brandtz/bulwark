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
    <AppSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <AppTopBar />
      <main class="flex-1 pb-bottom-nav md:pb-0">
        <slot />
      </main>
    </div>
    <AppBottomNav />
  </div>
</template>
