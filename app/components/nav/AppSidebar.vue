<!--
  AppSidebar.vue — desktop left rail (>=md) (WP-A5).

  Per ADR-0005 & Packet A shell spec:
    - Reads NAV_ITEMS from shared/nav/nav.config.ts filtered by active role
      and enabled feature flags.
    - Supports collapsing from 240px to 64px (`bulwark.sidebar.collapsed` in
      localStorage/cookie); collapsed items remain keyboard reachable and
      expose accessible names + tooltips (`title` & `aria-label`).
-->
<script setup lang="ts">
import { navItemsForRole, type NavItem } from '~~/shared/nav/nav.config'
import type { IconName } from '~/components/ui/icon-names'
import { useEnabledFeatureFlags } from '~/composables/useEnabledFeatureFlags'

const { session } = useSession()
const route = useRoute()

const collapsed = useCookie<boolean>('bulwark.sidebar.collapsed', {
  default: () => false,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
})

const { enabledFlags } = useEnabledFeatureFlags()

onMounted(() => {
  try {
    const stored = window.localStorage.getItem('bulwark.sidebar.collapsed')
    if (stored === 'true' || stored === 'false') collapsed.value = stored === 'true'
  } catch { /* ignore */ }
})

function toggleCollapse() {
  collapsed.value = !collapsed.value
  if (import.meta.client) {
    try { window.localStorage.setItem('bulwark.sidebar.collapsed', String(collapsed.value)) } catch { /* ignore */ }
  }
}

const groups = computed<Array<{ name: string; items: NavItem[] }>>(() => {
  if (!session.value) return []
  const items = navItemsForRole(session.value.activeRole, enabledFlags.value)
  const order: string[] = []
  const map = new Map<string, NavItem[]>()
  for (const it of items) {
    const g = it.group || ''
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(it)
  }
  return order.map((name) => ({ name, items: map.get(name)! }))
})

function isActive(to: string): boolean {
  if (to === '/' || to === '/admin') return route.path === to || (to === '/admin' && route.path === '/admin/dashboard')
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <aside
    class="hidden md:flex flex-col bg-sidebar text-sidebar-text shrink-0 h-screen sticky top-0 transition-all"
    :style="{ width: collapsed ? '64px' : '240px', background: 'var(--shell-bg, #0f172a)', color: 'var(--shell-text, #cbd5e1)' }"
    :data-collapsed="collapsed ? 'true' : 'false'"
    data-testid="app-sidebar"
  >
    <!-- Wordmark & collapse button -->
    <div class="px-3 py-4 border-b border-white/10 flex items-center gap-2" style="min-height: 56px">
      <div class="w-8 h-8 rounded-card bg-primary flex items-center justify-center font-bold text-white shrink-0">B</div>
      <div v-if="!collapsed" class="text-body-strong text-white truncate flex-1">Bulwark</div>
      <button
        type="button"
        class="ml-auto inline-flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 text-white"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-expanded="!collapsed"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        data-testid="sidebar-collapse-toggle"
        @click="toggleCollapse"
      >
        <BulwarkIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" size="sm" />
      </button>
    </div>

    <!-- Nav body -->
    <nav class="flex-1 overflow-y-auto py-3" aria-label="Primary">
      <div v-for="g in groups" :key="g.name" class="mb-4">
        <div
          v-if="g.name && !collapsed"
          class="px-5 pb-2 text-tiny uppercase tracking-wider text-sidebar-text/60"
        >
          {{ g.name }}
        </div>
        <ul class="px-2 space-y-1">
          <li v-for="item in g.items" :key="`${item.group}-${item.label}-${item.to}`">
            <NuxtLink
              :to="item.to"
              :title="item.label"
              :aria-label="item.label"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              :class="[
                'flex items-center gap-3 px-3 py-2 rounded text-body min-h-tap transition-colors',
                collapsed ? 'justify-center' : '',
                isActive(item.to)
                  ? 'bg-sidebar-active text-white font-semibold'
                  : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white',
              ]"
            >
              <BulwarkIcon :name="(item.icon as IconName)" size="md" class="shrink-0" />
              <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
              <span v-else class="sr-only">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Footer slot -->
    <div v-if="!collapsed" class="px-5 py-4 border-t border-white/10 text-tiny text-sidebar-text/60 truncate">
      Bulwark v0.0.1 · {{ session?.activeRole ?? '—' }}
    </div>
  </aside>
</template>
