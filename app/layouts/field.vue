<!--
  app/layouts/field.vue — mobile-first field crew layout (W3-3 / EH-M /
  ADR-0029).

  # Decisions (ADR-0008)
    - Independent of `layouts/default.vue` (ADR-0005 carve-out). The
      admin shell renders AppSidebar + AppTopBar + AppBottomNav for the
      full nav config; the field surface is a constrained, single-task
      view with its own four-tab bottom strip and a compact header
      that surfaces the active job title.
    - The header is sticky and the bottom nav is fixed — middle scroll
      area uses `pb-bottom-nav` so the last card never tucks under the
      tab bar. Min tap target is `min-h-tap` (48px, STYLE_GUIDE §6.1).
    - The four tabs are hard-coded inline here rather than fed through
      `shared/nav/nav.config.ts`. nav.config drives the admin sidebar
      and global mobile nav; the field tabs are a distinct concept
      (in-app context bar, not site navigation) and don't share state
      with the admin role's tabs.

  # Decision cast down
    - Rejected: re-using `<AppBottomNav />`. It reads role-scoped items
      from nav.config and would shadow the field tabs (My Day / Inspect
      / Photos / Notes) with the global field role's nav items
      (dashboard / properties / etc.). The field surface needs its own
      four-up tab strip for the in-job experience.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'

const route = useRoute()
const router = useRouter()
const { t } = useLabel()

interface FieldTab {
  to: string
  labelKey: string
  fallback: string
  icon: string
  /** Matcher predicate so jobs/:id/inspect lights the Inspect tab too. */
  match?: (path: string) => boolean
}

const tabs = computed<FieldTab[]>(() => [
  { to: '/field', labelKey: 'my-day', fallback: 'My Day', icon: 'calendar', match: (p) => p === '/field' || p === '/field/' || p.startsWith('/field/jobs/') && !p.includes('/inspect') && !p.includes('/photos') },
  { to: '/field/check-in', labelKey: 'inspect', fallback: 'Inspect', icon: 'clipboard-check', match: (p) => p.includes('/inspect') },
  { to: '/field/check-in', labelKey: 'photos', fallback: 'Photos', icon: 'camera', match: (p) => p.includes('/photos') },
  { to: '/field/check-in', labelKey: 'notes', fallback: 'Notes', icon: 'note', match: (p) => p.startsWith('/field/check-in') },
])

function isActive(tab: FieldTab): boolean {
  if (tab.match) return tab.match(route.path)
  return route.path === tab.to
}

const showBack = computed(() => route.path !== '/field' && route.path !== '/field/')

function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/field')
}

const headerTitle = computed(() => (route.meta.fieldTitle as string | undefined) ?? 'Bulwark Field')
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col" data-testid="field-layout">
    <a
      href="#field-main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-primary focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>

    <header
      class="sticky top-0 z-30 bg-surface border-b border-border flex items-center gap-2 px-3 h-14"
      data-testid="field-header"
    >
      <button
        v-if="showBack"
        type="button"
        class="min-h-tap min-w-tap inline-flex items-center justify-center rounded-input hover:bg-surface-muted -ml-2"
        :aria-label="'Back'"
        data-testid="field-back"
        @click="goBack"
      >
        <span aria-hidden="true" class="text-lg">‹</span>
      </button>
      <h1 class="text-body font-semibold truncate flex-1" data-testid="field-header-title">
        {{ headerTitle }}
      </h1>
      <FieldInstallBanner v-once />
    </header>

    <main
      id="field-main"
      tabindex="-1"
      class="flex-1 pb-bottom-nav focus:outline-none"
    >
      <slot />
    </main>

    <nav
      class="fixed bottom-0 inset-x-0 h-bottom-nav bg-surface border-t border-border grid grid-cols-4 z-30"
      aria-label="Field tabs"
      data-testid="field-tabs"
    >
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to + tab.labelKey"
        :to="tab.to"
        :class="[
          'flex flex-col items-center justify-center gap-1 text-tiny min-h-tap transition-colors',
          isActive(tab) ? 'text-primary' : 'text-text-secondary',
        ]"
        :data-testid="`field-tab-${tab.labelKey}`"
      >
        <span aria-hidden="true" class="text-base">●</span>
        <span>{{ t('field.tabs', tab.labelKey, tab.fallback) }}</span>
      </NuxtLink>
    </nav>

    <BulwarkToastHost />
  </div>
</template>
