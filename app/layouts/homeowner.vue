<!--
  app/layouts/homeowner.vue — homeowner portal layout (W3-4 / EH-O /
  ADR-0032).

  # Decisions
    - Independent of admin/field/sub shells. Homeowners see a friendly,
      mobile-first portal: Home, Properties, Quotes, Invoices.
    - Header sticky, bottom nav fixed, `pb-bottom-nav` on content,
      `min-h-tap` on tabs (STYLE_GUIDE §6.1).
    - All copy via useLabel().t('homeowner.tabs', …) so customers can
      re-skin labels.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'

const route = useRoute()
const router = useRouter()
const { t } = useLabel()

interface HoTab {
  to: string
  labelKey: string
  fallback: string
  icon: string
  match?: (path: string) => boolean
}

const tabs = computed<HoTab[]>(() => [
  { to: '/homeowner',            labelKey: 'home',       fallback: 'Home',       icon: 'home',        match: (p) => p === '/homeowner' || p === '/homeowner/' },
  { to: '/homeowner/properties', labelKey: 'properties', fallback: 'Properties', icon: 'home',        match: (p) => p.startsWith('/homeowner/properties') },
  { to: '/homeowner/quotes',     labelKey: 'quotes',     fallback: 'Quotes',     icon: 'file-text',   match: (p) => p.startsWith('/homeowner/quotes') },
  { to: '/homeowner/invoices',   labelKey: 'invoices',   fallback: 'Invoices',   icon: 'dollar-sign', match: (p) => p.startsWith('/homeowner/invoices') },
])

function isActive(tab: HoTab): boolean {
  if (tab.match) return tab.match(route.path)
  return route.path === tab.to
}

const showBack = computed(() => route.path !== '/homeowner' && route.path !== '/homeowner/')

function goBack(): void {
  if (window.history.length > 1) router.back()
  else router.push('/homeowner')
}

const headerTitle = computed(() => (route.meta.homeownerTitle as string | undefined) ?? 'Bulwark')
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col" data-testid="homeowner-layout">
    <a
      href="#homeowner-main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-primary focus:px-3 focus:py-2 focus:text-white focus:shadow-lg"
      data-testid="skip-to-content"
    >
      Skip to content
    </a>

    <header
      class="sticky top-0 z-30 bg-surface border-b border-border flex items-center gap-2 px-3 h-14"
      data-testid="homeowner-header"
    >
      <button
        v-if="showBack"
        type="button"
        class="min-h-tap min-w-tap inline-flex items-center justify-center rounded-input hover:bg-surface-muted -ml-2"
        aria-label="Back"
        data-testid="homeowner-back"
        @click="goBack"
      >
        <span aria-hidden="true" class="text-lg">‹</span>
      </button>
      <h1 class="text-body font-semibold truncate flex-1" data-testid="homeowner-header-title">
        {{ headerTitle }}
      </h1>
    </header>

    <main
      id="homeowner-main"
      tabindex="-1"
      class="flex-1 pb-bottom-nav focus:outline-none"
    >
      <slot />
    </main>

    <nav
      class="fixed bottom-0 inset-x-0 h-bottom-nav bg-surface border-t border-border grid grid-cols-4 z-30"
      aria-label="Homeowner tabs"
      data-testid="homeowner-tabs"
    >
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to + tab.labelKey"
        :to="tab.to"
        :class="[
          'flex flex-col items-center justify-center gap-1 text-tiny min-h-tap transition-colors',
          isActive(tab) ? 'text-primary' : 'text-text-secondary',
        ]"
        :data-testid="`homeowner-tab-${tab.labelKey}`"
      >
        <span aria-hidden="true" class="text-base">●</span>
        <span>{{ t('homeowner.tabs', tab.labelKey, tab.fallback) }}</span>
      </NuxtLink>
    </nav>

    <BulwarkToastHost />
  </div>
</template>
