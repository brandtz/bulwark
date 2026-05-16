<!--
  app/pages/notifications.vue — full notification feed (W3-1 / EH-J / ADR-0027).

  # Decisions
    - Signed-in only, no role gate. Each user sees their own feed.
    - 50/page with `unreadOnly` toggle. Unread rows render with a subtle
      highlight + a "New" chip; reading a row marks it read on click.
    - "Mark all read" mirrors the bell affordance for parity.
    - Severity chip + related-entity deep link mirror the bell dropdown
      so the two surfaces stay consistent.
-->
<script setup lang="ts">
import type { Notification } from '~~/shared/contracts/notification'

definePageMeta({})
useHead({ title: 'Notifications' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const notif = useService('notification')

const userId = computed(() => session.value?.userId ?? '')

const page = ref(1)
const pageSize = 50
const unreadOnly = ref(false)
const items = ref<Notification[]>([])
const total = ref(0)
const unreadTotal = ref(0)
const loading = ref(false)

async function load() {
  if (!userId.value) return
  loading.value = true
  try {
    const r = await notif.listForUser(userId.value, {
      page: page.value,
      pageSize,
      unreadOnly: unreadOnly.value,
    })
    items.value = r.rows
    total.value = r.total
    unreadTotal.value = r.unreadTotal
  } finally {
    loading.value = false
  }
}
await load()

watch([unreadOnly, page], () => { void load() })

async function onOpen(item: Notification) {
  if (item.readAt === null) {
    try { await notif.markRead(item.id) } catch { /* noop */ }
  }
  const target = deepLinkFor(item)
  if (target) await navigateTo(target)
  else await load()
}

async function onMarkAll() {
  if (!userId.value) return
  await notif.markAllRead(userId.value)
  await load()
}

function deepLinkFor(n: Notification): string | null {
  if (!n.relatedEntityType || !n.relatedEntityId) return null
  switch (n.relatedEntityType) {
    case 'quote': return `/admin/quotes/${n.relatedEntityId}`
    case 'work_order': return `/admin/work-orders/${n.relatedEntityId}`
    case 'invoice': return `/admin/invoices/${n.relatedEntityId}`
    case 'compliance_doc': return `/admin/compliance/${n.relatedEntityId}`
    case 'change_order': return `/admin/change-orders/${n.relatedEntityId}`
    case 'property': return `/admin/properties/${n.relatedEntityId}`
    default: return null
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

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="notifications-page">
    <BulwarkBreadcrumbs :items="[{ label: 'Notifications' }]" />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-h3 text-text-primary">Notifications</h1>
        <p class="text-small text-text-secondary">
          {{ unreadTotal }} unread &middot; {{ total }} total
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-small text-text-secondary">
          <input
            v-model="unreadOnly"
            type="checkbox"
            data-testid="notifications-filter-unread"
          >
          Unread only
        </label>
        <button
          type="button"
          class="px-3 py-1.5 rounded-input border border-border text-small hover:bg-surface-muted"
          data-testid="notifications-mark-all-read"
          @click="onMarkAll"
        >
          Mark all read
        </button>
      </div>
    </header>

    <ul class="mt-4 divide-y divide-border rounded-card bg-surface border border-border">
      <li
        v-if="loading"
        class="px-4 py-6 text-center text-small text-text-secondary"
      >
        Loading…
      </li>
      <li
        v-else-if="items.length === 0"
        class="px-4 py-10 text-center text-small text-text-secondary"
        data-testid="notifications-empty"
      >
        All caught up.
      </li>
      <li
        v-for="item in items"
        v-else
        :key="item.id"
        class="px-4 py-3 hover:bg-surface-muted cursor-pointer"
        :class="{ 'bg-blue-50/30': item.readAt === null }"
        data-testid="notifications-row"
        @click="onOpen(item)"
      >
        <div class="flex items-start gap-3">
          <span
            class="text-tiny px-1.5 py-0.5 rounded-input shrink-0"
            :class="chipClass(item.severity)"
          >
            {{ item.severity }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-small font-medium text-text-primary truncate">{{ item.title }}</span>
              <span
                v-if="item.readAt === null"
                class="text-tiny px-1 py-0.5 rounded-input bg-primary/10 text-primary"
              >New</span>
            </div>
            <div class="text-small text-text-secondary">{{ item.body }}</div>
            <div class="text-tiny text-text-secondary mt-1">
              {{ new Date(item.createdAt).toLocaleString() }} &middot; {{ item.eventType }}
            </div>
          </div>
        </div>
      </li>
    </ul>

    <nav v-if="totalPages > 1" class="mt-4 flex items-center justify-between text-small">
      <button
        type="button"
        class="px-3 py-1 rounded-input border border-border disabled:opacity-50"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        Previous
      </button>
      <span class="text-text-secondary">Page {{ page }} of {{ totalPages }}</span>
      <button
        type="button"
        class="px-3 py-1 rounded-input border border-border disabled:opacity-50"
        :disabled="page >= totalPages"
        @click="page = Math.min(totalPages, page + 1)"
      >
        Next
      </button>
    </nav>
  </div>
</template>
