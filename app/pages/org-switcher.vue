<!--
  pages/org-switcher.vue — pick which membership to act as (E2-S4).

  # Decisions (ADR-0008)

  - **Public route**: not gated by role middleware. The page itself only
    shows the *current user's* memberships, so there's no privilege
    escalation risk. Auth.global still requires a session.
  - **Uses the persistent shell layout** (no `layout: false`): the user
    is signed in here, and seeing the topbar/sidebar reinforces what
    "switching" means.
  - **One-membership users see a friendly "you only have one" copy**
    instead of a hidden empty state. The widget is meant to confirm the
    switch happened, not just no-op silently.

  # Decision cast down

  - **Modal dropdown only (no dedicated route)**. Rejected for v1 because
    a page is much simpler to wire up + test, and the topbar widget can
    deep-link into it. The full dropdown UserMenu lands in E2-S5 and may
    surface this list inline.
  - **Auto-redirect to `/admin/dashboard` after switching**. Rejected
    until E5 ships role dashboards for field/sub — only org_admin /
    super_admin actually have a target dashboard today. We let `/`'s
    role-aware redirect handle it.
-->

<script setup lang="ts">
useHead({ title: 'Switch organization' })

const { session, switchActiveOrg, loading, error } = useAuth()
const switching = ref<string | null>(null)

async function pick(orgId: string) {
  switching.value = orgId
  try {
    const ok = await switchActiveOrg(orgId)
    if (ok) await navigateTo('/')
  } finally {
    switching.value = null
  }
}
</script>

<template>
  <div class="p-4 md:p-8 max-w-xl">
    <h1 class="text-display">Switch organization</h1>
    <p class="text-body text-text-secondary mt-1">
      You're acting on behalf of one organization at a time. Pick which one.
    </p>

    <div
      v-if="error"
      role="alert"
      class="mt-4 rounded-input border border-status-error/30 bg-status-error/5 px-3 py-2 text-small text-status-error"
    >{{ error }}</div>

    <div class="mt-6 space-y-2" data-testid="org-list">
      <button
        v-for="m in session?.memberships ?? []"
        :key="m.organizationId"
        type="button"
        :data-testid="`org-row-${m.organizationId}`"
        :disabled="loading || switching !== null"
        class="w-full flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left hover:border-primary disabled:opacity-50"
        :class="m.organizationId === session?.activeOrganizationId ? 'border-primary' : ''"
        @click="pick(m.organizationId)"
      >
        <div>
          <div class="text-body-strong text-text-primary">{{ m.organizationName }}</div>
          <div class="text-small text-text-secondary">{{ m.role }}</div>
        </div>
        <span
          v-if="m.organizationId === session?.activeOrganizationId"
          class="text-small text-primary"
          data-testid="org-active-badge"
        >Active</span>
        <span
          v-else-if="switching === m.organizationId"
          class="text-small text-text-secondary"
        >Switching…</span>
      </button>
    </div>

    <div
      v-if="(session?.memberships?.length ?? 0) <= 1"
      class="mt-4 text-small text-text-secondary"
      data-testid="org-singleton-notice"
    >
      You only belong to one organization. Switching will be available when
      you're added to a second.
    </div>
  </div>
</template>
