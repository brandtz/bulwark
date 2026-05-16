<!--
  components/nav/NotificationBell.vue — top-bar notification bell + dropdown
  (W3-1 / EH-J / ADR-0027).

  # Decisions (ADR-0008, ADR-0027)
    - Self-polling. The bell pings `notificationService.unreadCountForUser`
      every 30 seconds; the dropdown lazily loads the latest 10 rows on
      open. TODO (Phase 2): swap polling for an SSE channel so the badge
      updates without round-tripping a count query. Tracked in ADR-0027.
    - Click-to-toggle + click-outside-to-close (mirrors UserMenu pattern).
    - "Mark all read" hits the contract method, then refreshes both the
      badge and the dropdown. "See all" deep-links to `/notifications`.
    - Severity → chip color via a single map. Default to `info`.
    - Defensive: every async call is try/catch so a transient backend
      error never freezes the chrome.
-->
<script setup lang="ts">
import type { Notification } from '~~/shared/contracts/notification'

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const notif = useService('notification')

const open = ref(false)
const unread = ref(0)
const items = ref<Notification[]>([])
const loading = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const userId = computed(() => session.value?.userId ?? '')

async function refreshCount() {
  if (!userId.value) return
  try {
    unread.value = await notif.unreadCountForUser(userId.value)
  } catch {
    // Swallow — bell stays at last-known count.
  }
}

async function loadList() {
  if (!userId.value) return
  loading.value = true
  try {
    const r = await notif.listForUser(userId.value, { pageSize: 10 })
    items.value = r.rows
    unread.value = r.unreadTotal
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) await loadList()
}

function close() { open.value = false }

function onDocMousedown(ev: MouseEvent) {
  const t = ev.target
  if (!wrapperRef.value || !(t instanceof Node)) return
  if (!wrapperRef.value.contains(t)) close()
}
function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') close() }

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

async function markAllRead() {
  if (!userId.value) return
  try {
    await notif.markAllRead(userId.value)
    await loadList()
  } catch {
    // ignore
  }
}

async function openItem(item: Notification) {
  try {
    if (item.readAt === null) await notif.markRead(item.id)
  } catch {
    // ignore
  }
  // Best-effort deep link based on related entity.
  const target = deepLinkFor(item)
  close()
  if (target) await navigateTo(target)
  else await refreshCount()
}

function deepLinkFor(n: Notification): string | null {
  if (!n.relatedEntityType || !n.relatedEntityId) return '/notifications'
  switch (n.relatedEntityType) {
    case 'quote': return `/admin/quotes/${n.relatedEntityId}`
    case 'work_order': return `/admin/work-orders/${n.relatedEntityId}`
    case 'invoice': return `/admin/invoices/${n.relatedEntityId}`
    case 'compliance_doc': return `/admin/compliance/${n.relatedEntityId}`
    case 'change_order': return `/admin/change-orders/${n.relatedEntityId}`
    case 'property': return `/admin/properties/${n.relatedEntityId}`
    default: return '/notifications'
  }
}

function chipClass(sev: Notification['severity']): string {
  switch (sev) {
    case 'success': return 'bg-green-100 text-green-800'
    case 'warning': return 'bg-amber-100 text-amber-800'
    case 'error': return 'bg-red-100 text-red-800'
    default: return 'bg-blue-100 text-blue-800'
  }
}

onMounted(() => {
  void refreshCount()
  pollTimer = setInterval(refreshCount, 30_000)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div ref="wrapperRef" class="relative">
    <button
      type="button"
      class="relative rounded-input p-1.5 hover:bg-surface-muted"
      data-testid="notification-bell-button"
      :aria-expanded="open"
      :aria-label="`Notifications (${unread} unread)`"
      @click="toggle"
    >
      <BulwarkIcon name="bell" size="md" class="text-text-secondary" />
      <span
        v-if="unread > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-tiny font-semibold flex items-center justify-center"
        data-testid="notification-bell-badge"
      >
        {{ unread > 99 ? '99+' : unread }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-96 max-w-[90vw] rounded-card bg-surface border border-border shadow-card z-30"
      role="menu"
      data-testid="notification-bell-panel"
    >
      <header class="flex items-center justify-between px-4 py-2 border-b border-border">
        <span class="text-small font-semibold text-text-primary">Notifications</span>
        <button
          type="button"
          class="text-tiny text-text-secondary hover:text-text-primary"
          data-testid="notification-mark-all-read"
          @click="markAllRead"
        >
          Mark all read
        </button>
      </header>
      <ul class="max-h-96 overflow-y-auto divide-y divide-border">
        <li v-if="loading" class="px-4 py-6 text-center text-small text-text-secondary">
          Loading…
        </li>
        <li
          v-else-if="items.length === 0"
          class="px-4 py-6 text-center text-small text-text-secondary"
          data-testid="notification-empty"
        >
          All caught up.
        </li>
        <li
          v-for="item in items"
          v-else
          :key="item.id"
          class="px-4 py-3 hover:bg-surface-muted cursor-pointer"
          :class="{ 'bg-blue-50/40': item.readAt === null }"
          data-testid="notification-item"
          @click="openItem(item)"
        >
          <div class="flex items-start gap-2">
            <span class="text-tiny px-1.5 py-0.5 rounded-input" :class="chipClass(item.severity)">
              {{ item.severity }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-small font-medium text-text-primary truncate">{{ item.title }}</div>
              <div class="text-tiny text-text-secondary line-clamp-2">{{ item.body }}</div>
            </div>
          </div>
        </li>
      </ul>
      <footer class="px-4 py-2 border-t border-border text-center">
        <NuxtLink
          to="/notifications"
          class="text-small text-primary hover:underline"
          data-testid="notification-see-all"
          @click="close"
        >
          See all
        </NuxtLink>
      </footer>
    </div>
  </div>
</template>
