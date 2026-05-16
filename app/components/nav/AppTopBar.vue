<!--
  AppTopBar.vue — top bar with breadcrumbs (slot), org switcher, user menu.

  Visible on every authenticated page. Per ADR-0005, the only place
  these chrome elements may render.
-->
<script setup lang="ts">
const { session } = useSession()
const { open: openSearch, state: searchState, close: closeSearch } = useGlobalSearch()
const { t: tLabel } = useLabel()

const orgName = computed(() => {
  if (!session.value) return ''
  return session.value.memberships.find(m => m.organizationId === session.value!.activeOrganizationId)?.organizationName
    ?? session.value.memberships[0]?.organizationName ?? ''
})

// Cmd-K / Ctrl-K toggles the palette globally. Esc closes (the
// palette also binds Esc internally, but binding here keeps the
// affordance discoverable when the input isn't focused).
function onGlobalKey(e: KeyboardEvent) {
  const isOpen = searchState.value.isOpen
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    if (isOpen) closeSearch()
    else openSearch()
    return
  }
  if (e.key === 'Escape' && isOpen) {
    e.preventDefault()
    closeSearch()
  }
}

onMounted(() => {
  if (typeof document === 'undefined') return
  document.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <header class="h-topbar bg-surface border-b border-border flex items-center px-4 gap-4 sticky top-0 z-20">
    <!-- Breadcrumb / page title slot. Pages set via useHead title; we
         show that as a fallback. The breadcrumbs component lands in E1-S5. -->
    <div class="flex-1 flex items-center min-w-0">
      <slot name="breadcrumbs">
        <span class="text-body text-text-primary truncate">{{ orgName }}</span>
      </slot>
    </div>

    <!-- W4-1 / EH-P: visible Cmd-K trigger. Acts like an input but
         actually opens the SearchPalette modal on click/focus. -->
    <button
      v-if="session"
      type="button"
      class="hidden md:inline-flex items-center gap-2 h-input px-3 rounded-input bg-surface-muted text-text-secondary text-small border border-border hover:border-primary transition-colors w-64"
      data-testid="topbar-search-trigger"
      :aria-label="tLabel('search', 'placeholder', 'Search… ⌘K')"
      @click="openSearch"
    >
      <BulwarkIcon name="search" size="sm" />
      <span class="flex-1 text-left truncate">{{ tLabel('search', 'placeholder', 'Search… ⌘K') }}</span>
    </button>

    <!--
      Org switcher chip. For users with >1 membership it's a NuxtLink to
      /org-switcher. For single-org users it stays a static label so we
      don't tease an action that isn't actionable.
    -->
    <NuxtLink
      v-if="(session?.memberships?.length ?? 0) > 1"
      to="/org-switcher"
      class="hidden sm:flex items-center px-3 py-1.5 rounded text-small text-text-primary border border-border bg-background hover:border-primary"
      data-testid="org-switcher"
      aria-label="Switch organization"
    >
      <span class="truncate max-w-[14rem]">{{ orgName }}</span>
      <BulwarkIcon name="chevron-down" size="sm" class="ml-2 text-text-secondary" />
    </NuxtLink>
    <div
      v-else
      class="hidden sm:flex items-center px-3 py-1.5 rounded text-small text-text-secondary border border-border bg-background"
      data-testid="org-switcher"
    >
      {{ orgName }}
    </div>

    <!-- W3-1: notification bell + unread badge (ADR-0027). -->
    <NotificationBell v-if="session" />

    <!-- User chip + dropdown (E2-S5). The UserMenu owns logout-button. -->
    <UserMenu />

    <!-- W4-1 / EH-P: global Cmd-K palette overlay (Teleported). -->
    <SearchPalette v-if="session" />
  </header>
</template>
