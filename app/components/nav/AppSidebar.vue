<!--
  AppSidebar.vue — desktop left rail (>=md).

  Per ADR-0005, this is the only component that may render the persistent
  sidebar. It reads NAV_ITEMS from shared/nav/nav.config.ts filtered by the
  active session role.

  Visual: STYLE_GUIDE §2.2 (sidebar #0f172a) + §6.6 (240px width).
-->
<script setup lang="ts">
import { navItemsForRole, type NavItem } from '~~/shared/nav/nav.config'

const { session } = useSession()
const route = useRoute()

const groups = computed<Array<{ name: string, items: NavItem[] }>>(() => {
  if (!session.value) return []
  const items = navItemsForRole(session.value.activeRole)
  const order: string[] = []
  const map = new Map<string, NavItem[]>()
  for (const it of items) {
    const g = it.group || ''
    if (!map.has(g)) { map.set(g, []); order.push(g) }
    map.get(g)!.push(it)
  }
  return order.map(name => ({ name, items: map.get(name)! }))
})

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <aside class="hidden md:flex flex-col w-sidebar bg-sidebar text-sidebar-text shrink-0 h-screen sticky top-0">
    <!-- Wordmark -->
    <div class="px-5 py-5 border-b border-white/10 flex items-center gap-3">
      <div class="w-8 h-8 rounded-card bg-primary flex items-center justify-center font-bold text-white">B</div>
      <div class="text-body-strong text-white">Bulwark</div>
    </div>

    <!-- Nav body -->
    <nav class="flex-1 overflow-y-auto py-3" aria-label="Primary">
      <div v-for="g in groups" :key="g.name" class="mb-4">
        <div v-if="g.name" class="px-5 pb-2 text-tiny uppercase tracking-wider text-sidebar-text/60">
          {{ g.name }}
        </div>
        <ul class="px-2 space-y-1">
          <li v-for="item in g.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              :class="[
                'flex items-center gap-3 px-3 py-2 rounded text-body min-h-tap transition-colors',
                isActive(item.to)
                  ? 'bg-sidebar-active text-white'
                  : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white',
              ]"
            >
              <span class="w-5 h-5 inline-block rounded bg-white/10 shrink-0" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Footer slot -->
    <div class="px-5 py-4 border-t border-white/10 text-tiny text-sidebar-text/60">
      Bulwark v0.0.1 · {{ session?.activeRole ?? '—' }}
    </div>
  </aside>
</template>
