<!--
  pages/index.vue — temporary E0 landing page

  This is a placeholder so `pnpm dev` boots successfully and the sponsor can
  visually confirm the scaffold is working. It will be replaced in E2-S2 by a
  redirect to /login (when unauthenticated) or to the role's home page.

  Decisions NOT taken:
    - We do NOT redirect to demo/login.html — the demo and the real app are
      separate artifacts (ADR-0011).
-->
<script setup lang="ts">
useHead({ title: 'Welcome' })

// Temporary list of the four future portal homes. These do not link
// anywhere yet — E1 stands up the layout, E2 stands up auth, then these
// will become real entry points.
const portals = [
  { role: 'Admin / Owner', home: '/admin/dashboard', tone: 'primary' },
  { role: 'Field / GC', home: '/field/dashboard', tone: 'success' },
  { role: 'Subcontractor', home: '/sub/dashboard', tone: 'purple' },
  { role: 'Homeowner', home: '/homeowner/dashboard', tone: 'info' },
]
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="max-w-2xl w-full">
      <div class="mb-8">
        <div class="inline-flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-card bg-primary text-white flex items-center justify-center font-bold">B</div>
          <span class="text-display">Bulwark</span>
        </div>
        <p class="text-text-secondary">
          Wildfire Retrofit Operations &amp; Compliance Platform.
          Scaffold is live — Epic E0 in progress.
        </p>
      </div>

      <div class="bg-surface border border-border rounded-card p-6 shadow-card">
        <h2 class="text-heading mb-3">Build Status</h2>
        <p class="text-body text-text-secondary mb-4">
          The persistent application shell, auth, and portal homes ship in
          Epic E1 and E2. This page exists only to confirm the scaffold renders.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="p in portals"
            :key="p.role"
            class="p-4 rounded-card border border-border bg-background"
          >
            <div class="text-tiny uppercase tracking-wider text-text-secondary">{{ p.role }}</div>
            <div class="text-body-strong mt-1">{{ p.home }}</div>
            <div class="text-small text-text-disabled mt-1">Coming in E1 / E2</div>
          </div>
        </div>
      </div>

      <p class="text-small text-text-disabled mt-6 text-center">
        See <code>BUILD_PLAN.md</code> and <code>BUILD_STATUS.md</code> for live progress.
      </p>
    </div>
  </div>
</template>
