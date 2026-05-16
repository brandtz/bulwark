<!--
  app/layouts/sub.vue — subcontractor portal layout (W3-4 / EH-N /
  ADR-0031).

  # Decisions
    - Independent of `layouts/default.vue` (admin shell). Subs see a
      narrow, mobile-first portal with four tabs (Work orders, Quotes,
      COIs, Settings) — no admin sidebar, no global toolbar.
    - Header is sticky; bottom nav is fixed. The middle area uses
      `pb-bottom-nav` so the last card never tucks under the strip.
      Tap targets are `min-h-tap` (≥48px, STYLE_GUIDE §6.1).
    - Tabs declared inline (not nav.config) to keep the portal copy
      isolated from admin/field nav and to allow useLabel-based
      relabeling per ADR-0019.
    - All copy goes through useLabel().t('sub.tabs', key, fallback) so
      orgs can rename "COIs" → "Insurance" without code changes.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'

const route = useRoute()
const router = useRouter()
const { t } = useLabel()

interface SubTab {
  to: string
  labelKey: string
  fallback: string
  icon: string
  match?: (path: string) => boolean
}

const tabs = computed<SubTab[]>(() => [
  { to: '/sub/work-orders', labelKey: 'wos', fallback: 'My WOs', icon: 'wrench', match: (p) => p.startsWith('/sub/work-orders') || p === '/sub' || p === '/sub/' },
  { to: '/sub/quotes',      labelKey: 'quotes', fallback: 'My Quotes', icon: 'file-text', match: (p) => p.startsWith('/sub/quotes') },
  { to: '/sub/cois',        labelKey: 'cois', fallback: 'My COIs', icon: 'shield', match: (p) => p.startsWith('/sub/cois') },
  { to: '/sub/settings',    labelKey: 'settings', fallback: 'Settings', icon: 'settings', match: (p) => p.startsWith('/sub/settings') },
])

function isActive(tab: SubTab): boolean {
  if (tab.match) return tab.match(route.path)
  return route.path === tab.to
}

const showBack = computed(() => route.path !== '/sub' && route.path !== '/sub/')

function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/sub')
}

const headerTitle = computed(() => (route.meta.subTitle as string | undefined) ?? 'Bulwark Sub Portal')
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col" data-testid="sub-layout">
    <a
      href="#sub-main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-primary focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>

    <header
      class="sticky top-0 z-30 bg-surface border-b border-border flex items-center gap-2 px-3 h-14"
      data-testid="sub-header"
    >
      <button
        v-if="showBack"
        type="button"
        class="min-h-tap min-w-tap inline-flex items-center justify-center rounded-input hover:bg-surface-muted -ml-2"
        aria-label="Back"
        data-testid="sub-back"
        @click="goBack"
      >
        <span aria-hidden="true" class="text-lg">‹</span>
      </button>
      <h1 class="text-body font-semibold truncate flex-1" data-testid="sub-header-title">
        {{ headerTitle }}
      </h1>
    </header>

    <main
      id="sub-main"
      tabindex="-1"
      class="flex-1 pb-bottom-nav focus:outline-none"
    >
      <slot />
    </main>

    <nav
      class="fixed bottom-0 inset-x-0 h-bottom-nav bg-surface border-t border-border grid grid-cols-4 z-30"
      aria-label="Sub tabs"
      data-testid="sub-tabs"
    >
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to + tab.labelKey"
        :to="tab.to"
        :class="[
          'flex flex-col items-center justify-center gap-1 text-tiny min-h-tap transition-colors',
          isActive(tab) ? 'text-primary' : 'text-text-secondary',
        ]"
        :data-testid="`sub-tab-${tab.labelKey}`"
      >
        <span aria-hidden="true" class="text-base">●</span>
        <span>{{ t('sub.tabs', tab.labelKey, tab.fallback) }}</span>
      </NuxtLink>
    </nav>

    <BulwarkToastHost />
  </div>
</template>
