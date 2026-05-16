<!--
  AppBottomNav.vue — mobile-only bottom navigation (<md).

  Reads `mobile: true` items from nav.config.ts for the active role, max 5.
  Per ADR-0005 this is the only place the bottom-nav is rendered.
-->
<script setup lang="ts">
import { mobileNavItemsForRole } from '~~/shared/nav/nav.config'
import type { IconName } from '~/components/ui/icon-names'

const { session } = useSession()
const route = useRoute()

const items = computed(() => session.value ? mobileNavItemsForRole(session.value.activeRole) : [])

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <nav
    v-if="items.length"
    class="md:hidden fixed bottom-0 inset-x-0 h-bottom-nav bg-surface border-t border-border grid z-30"
    :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
    aria-label="Mobile primary"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :class="[
        'flex flex-col items-center justify-center gap-1 text-tiny min-h-tap transition-colors',
        isActive(item.to) ? 'text-primary' : 'text-text-secondary',
      ]"
    >
      <!-- W2-6 / EH-L: real glyph from the sprite. -->
      <BulwarkIcon :name="(item.icon as IconName)" size="md" />
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>
