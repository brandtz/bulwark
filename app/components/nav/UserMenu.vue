<!--
  components/nav/UserMenu.vue — top-bar avatar dropdown (E2-S5).

  Replaces the inline "Sign out" button in AppTopBar with a proper menu:
  user identity row + "Switch organization" link (when applicable) +
  "Sign out". Future settings / API-keys links land here as the surface
  area grows.

  # Decisions (ADR-0008)

  - **Click-to-toggle, click-outside-to-close**: avoids the hover-only
    pattern that field workers can't use on touch screens. The on-page
    `useEventListener('mousedown')` is attached only while open to
    minimize global listeners.
  - **Closes on route change**: a `watch(route)` resets `open` so users
    don't see the menu lingering after picking "Switch organization".
  - **Keyboard escape closes**: `Escape` is a baseline expectation for
    dropdowns. Tab-trap is intentionally OUT of scope for v1 — it would
    require the floating-ui library and we don't ship that yet (E1-S5
    deferred it).
  - **Single component, not a generic `BulwarkMenu` primitive**: at this
    point we have exactly one dropdown. Premature abstraction. When we
    have 2-3 menus we can extract.

  # Decision cast down

  - **Headless UI / Radix**. Rejected — adding a runtime dep for a
    50-line component is not warranted and we already own the Tailwind
    token set the rest of the app uses.
  - **Render the menu inline as siblings** (the previous approach).
    Rejected because clicking outside the inline button to dismiss
    didn't work without a wrapper.
-->

<script setup lang="ts">
const { session } = useSession()
const { logout } = useAuth()
const route = useRoute()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const initials = computed(() => {
  const n = session.value?.fullName ?? ''
  return n.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
})

const hasMultipleOrgs = computed(
  () => (session.value?.memberships?.length ?? 0) > 1,
)

function toggle() { open.value = !open.value }
function close() { open.value = false }

function onDocMousedown(ev: MouseEvent) {
  const t = ev.target
  if (!menuRef.value || !(t instanceof Node)) return
  if (!menuRef.value.contains(t)) close()
}
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (typeof document === 'undefined') return
  if (isOpen) {
    document.addEventListener('mousedown', onDocMousedown)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    document.removeEventListener('keydown', onKey)
  }
})

watch(() => route.fullPath, () => close())

async function doLogout() {
  close()
  await logout()
}
</script>

<template>
  <div ref="menuRef" class="relative">
    <button
      type="button"
      class="flex items-center gap-2 rounded-input px-2 py-1 hover:bg-surface-muted"
      data-testid="user-menu-button"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="Open user menu"
      @click="toggle"
    >
      <div class="w-8 h-8 rounded-full bg-primary text-white text-small font-semibold flex items-center justify-center">
        {{ initials }}
      </div>
      <div class="hidden sm:block text-left">
        <div class="text-small text-text-primary leading-tight">{{ session?.fullName }}</div>
        <div class="text-tiny text-text-secondary leading-tight">{{ session?.activeRole }}</div>
      </div>
      <!-- W2-6 / EH-L: sprite chevron replaces the inline ▾ glyph. -->
      <BulwarkIcon name="chevron-down" size="sm" class="hidden sm:inline text-text-secondary" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-card shadow-lg p-1 z-30"
      data-testid="user-menu-panel"
    >
      <div class="px-3 py-2 border-b border-border">
        <div class="text-small font-medium text-text-primary truncate">{{ session?.fullName }}</div>
        <div class="text-tiny text-text-secondary truncate">{{ session?.email }}</div>
      </div>

      <NuxtLink
        v-if="hasMultipleOrgs"
        to="/org-switcher"
        class="block px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="user-menu-switch-org"
        @click="close"
      >Switch organization</NuxtLink>

      <NuxtLink
        to="/profile/notifications"
        class="block px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="user-menu-notifications"
        @click="close"
      >Notification preferences</NuxtLink>

      <NuxtLink
        to="/profile/security"
        class="block px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="user-menu-security"
        @click="close"
      >Security</NuxtLink>

      <NuxtLink
        to="/profile/data"
        class="block px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="user-menu-account-data"
        @click="close"
      >Account &amp; data</NuxtLink>

      <button
        type="button"
        class="w-full text-left px-3 py-2 text-small text-text-primary rounded hover:bg-surface-muted"
        data-testid="logout-button"
        @click="doLogout"
      >Sign out</button>
    </div>
  </div>
</template>
