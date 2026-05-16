<!--
  app/pages/sub/quotes.vue — list quotes awaiting the sub's response
  with inline accept/decline (W3-4 / EH-N / ADR-0031).

  # Decisions
    - Calls `quoteService.respondToQuote` directly; service emits
      `subQuoteResponded` which the admin notification feed picks up.
    - Notes optional, max 500 chars (matched by contract); we don't
      bother surfacing the limit here, mirror dialogs in admin.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

useHead({ title: 'My quotes' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const sub = useService('subcontractor')
const quote = useService('quote')

type QuoteLite = { id: string; quoteNumber?: string; status?: string }

function narrow(rows: unknown[]): QuoteLite[] {
  return rows.map((r) => {
    const o = r as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      quoteNumber: typeof o.quoteNumber === 'string' ? o.quoteNumber : undefined,
      status: typeof o.status === 'string' ? o.status : undefined,
    }
  })
}

const subId = ref<string | null>(null)
const rows = ref<QuoteLite[]>([])
const busy = ref<string | null>(null)

async function refresh(): Promise<void> {
  if (!orgId.value || !userId.value) return
  const resolved = await sub.resolveSubForUser(userId.value, orgId.value)
  subId.value = resolved?.subcontractorId ?? null
  const raw = await sub.listMyQuotesRequested(userId.value, orgId.value)
  rows.value = narrow(raw)
}

await refresh()

async function respond(id: string, response: 'accepted' | 'declined'): Promise<void> {
  if (!subId.value || !orgId.value) return
  busy.value = id
  try {
    await quote.respondToQuote({
      id,
      organizationId: orgId.value,
      subcontractorId: subId.value,
      response,
    })
    await refresh()
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="sub-quotes">
    <h1 class="text-display">My quotes</h1>
    <p class="text-body text-text-secondary mt-1">Quotes awaiting your response.</p>

    <ul v-if="rows.length" class="mt-4 space-y-2">
      <li v-for="row in rows" :key="row.id" :data-testid="`sub-quote-${row.id}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ row.quoteNumber || row.id }}</p>
          <p class="text-small text-text-secondary mt-1">{{ row.status }}</p>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="min-h-tap rounded-input bg-primary text-white px-3 disabled:opacity-50"
              :disabled="busy === row.id"
              :data-testid="`sub-quote-accept-${row.id}`"
              @click="respond(row.id, 'accepted')"
            >Accept</button>
            <button
              type="button"
              class="min-h-tap rounded-input border border-border px-3 disabled:opacity-50"
              :disabled="busy === row.id"
              :data-testid="`sub-quote-decline-${row.id}`"
              @click="respond(row.id, 'declined')"
            >Decline</button>
          </div>
        </BulwarkCard>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="sub-quotes-empty"
      title="No quotes waiting"
      body="You're all caught up — nothing to respond to right now."
    />
  </div>
</template>
