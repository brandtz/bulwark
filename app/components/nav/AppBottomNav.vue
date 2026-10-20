<!--
  AppBottomNav.vue — mobile-only bottom navigation (<md) + SH-10 More sheet (WP-A5).

  Reads `mobile: true` items from nav.config.ts for the active role (up to 4)
  plus a 5th "More" button when overflow items or account/theme controls exist,
  guaranteeing the bar never exceeds 5 items for any role.
-->
<script setup lang="ts">
import { mobileNavItemsForRole, overflowNavItemsForRole } from '~~/shared/nav/nav.config'
import type { IconName } from '~/components/ui/icon-names'
import { useEnabledFeatureFlags } from '~/composables/useEnabledFeatureFlags'

const { session } = useSession()
const { theme, setTheme } = useTheme()
const route = useRoute()
const { enabledFlags } = useEnabledFeatureFlags()
const {
  warningOpen: signOutWarningOpen,
  pendingWrites: pendingSignOutWrites,
  inspectionFailed: signOutInspectionFailed,
  refreshPendingWrites,
  requestSignOut,
  confirmSignOut,
  cancelSignOut,
} = useQueuedWorkSignOut()

const moreOpen = ref(false)
const items = computed(() => (session.value ? mobileNavItemsForRole(session.value.activeRole, enabledFlags.value) : []))
const overflowItems = computed(() => (session.value ? overflowNavItemsForRole(session.value.activeRole, enabledFlags.value) : []))
const totalTabs = computed(() => Math.min(5, items.value.length + 1))

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/')
}

watch(() => route.fullPath, () => {
  moreOpen.value = false
  refreshPendingWrites()
})

function onQueueChanged(): void {
  refreshPendingWrites()
}

onMounted(() => {
  refreshPendingWrites()
  window.addEventListener('bulwark:offline-queue-changed', onQueueChanged)
})
onBeforeUnmount(() => {
  window.removeEventListener('bulwark:offline-queue-changed', onQueueChanged)
})

async function handleSignOut() {
  moreOpen.value = false
  await requestSignOut()
}
</script>

<template>
  <nav
    v-if="session"
    class="md:hidden fixed bottom-0 inset-x-0 h-bottom-nav bg-surface border-t border-border grid z-30"
    :style="{ gridTemplateColumns: `repeat(${totalTabs}, minmax(0, 1fr))` }"
    aria-label="Mobile primary"
    data-testid="mobile-bottom-nav"
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
      <BulwarkIcon :name="(item.icon as IconName)" size="md" />
      <span>{{ item.label }}</span>
    </NuxtLink>

    <button
      type="button"
      class="flex flex-col items-center justify-center gap-1 text-tiny min-h-tap transition-colors text-text-secondary"
      :aria-expanded="moreOpen"
      aria-label="More"
      data-testid="mobile-more-button"
      @click="moreOpen = true"
    >
      <BulwarkIcon name="more-horizontal" size="md" />
      <span>More</span>
    </button>
  </nav>

  <BulwarkBottomSheet :open="moreOpen" title="More" @close="moreOpen = false">
    <div class="flex flex-col gap-3 py-2" data-testid="mobile-more-sheet">
      <!-- Identity row -->
      <div class="flex items-center justify-between gap-3 px-2 py-2 border-b" style="border-color: var(--border-subtle)">
        <div class="min-w-0">
          <div class="font-semibold truncate">{{ session?.fullName }}</div>
          <div class="bw-help truncate">{{ session?.email }} · {{ session?.activeRole }}</div>
        </div>
        <NuxtLink
          v-if="(session?.memberships?.length ?? 0) > 1"
          to="/org-switcher"
          class="bw-btn bw-btn--secondary bw-btn--sm"
          data-testid="more-sheet-switch-org"
          @click="moreOpen = false"
        >
          Switch org
        </NuxtLink>
      </div>

      <!-- Overflow navigation -->
      <ul v-if="overflowItems.length" class="flex flex-col gap-1" aria-label="More navigation">
        <li v-for="item in overflowItems" :key="`${item.label}-${item.to}`">
          <NuxtLink
            :to="item.to"
            class="flex items-center gap-3 px-3 py-3 rounded min-h-12 hover:bg-surface-muted"
            @click="moreOpen = false"
          >
            <BulwarkIcon :name="(item.icon as IconName)" size="md" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.to === '/field/sync-queue' && pendingSignOutWrites.length"
              class="ml-auto min-w-6 h-6 rounded-full bg-status-warning/10 px-1 text-tiny font-semibold text-status-warning inline-flex items-center justify-center"
              :aria-label="`${pendingSignOutWrites.length} pending`"
              data-testid="sync-queue-count"
            >
              {{ pendingSignOutWrites.length }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <!-- Theme selector -->
      <div class="flex items-center justify-between gap-2 px-3 py-2 border-t" style="border-color: var(--border-subtle)" data-touch-row>
        <span class="text-sm font-medium">Theme</span>
        <BulwarkSegmentedControl
          :model-value="theme"
          :options="[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'Auto' },
          ]"
          aria-label="Theme preference"
          @update:model-value="(v: string) => setTheme(v as 'light' | 'dark' | 'system')"
        />
      </div>

      <!-- Sign out -->
      <button
        type="button"
        class="bw-btn bw-btn--destructive w-full justify-center min-h-12 mt-1"
        data-testid="more-sheet-sign-out"
        @click="handleSignOut"
      >
        Sign out
      </button>
    </div>
  </BulwarkBottomSheet>
  <SignOutQueueWarning
    :open="signOutWarningOpen"
    :items="pendingSignOutWrites"
    :inspection-failed="signOutInspectionFailed"
    @cancel="cancelSignOut"
    @confirm="confirmSignOut"
  />
</template>
