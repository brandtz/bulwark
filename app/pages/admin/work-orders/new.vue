<!--
  app/pages/admin/work-orders/new.vue — top-level "+ New work order"
  accepted-quote picker (E14-S3).

  # Decisions (ADR-0008)
    - WOs are derived from accepted quotes (E6-S2 builder seeds the
      trade slots from quote line items). Per the audit, the org-wide
      WO index had no entry point. This page lists every accepted quote
      across the org and hands off to the existing builder via
      `?quoteId=` so the trade-slot pre-population still runs.
    - Only `status === 'accepted'` quotes are listed; draft / sent /
      rejected / expired are not eligible parents. We show an explicit
      empty-state when there are zero accepted quotes that points the
      user at the quotes list (where they can mark a quote accepted).
    - Pure routing surface — no mutations. Same shape as quotes/new.

  # Decision cast down
    - Rejected: a "from scratch" WO mode without a parent quote. The
      contract requires a `quoteId` (E6-S2 decision); changing it to
      optional is more work than this story should take.
    - Rejected: server-side filter by status. Contract supports it
      (`status` on `QuoteListInput`); we use it directly.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'New work order — pick an accepted quote' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const quote = useService('quote')
const property = useService('property')
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle } = await useAsyncData(
  () => `wo-picker-quotes-${orgId.value}`,
  async () => {
    const list = await quote.list({
      organizationId: orgId.value,
      page: 1,
      pageSize: 200,
      status: 'accepted',
    })
    const propertyIds = Array.from(new Set(list.rows.map((q) => q.propertyId)))
    const propMap = new Map<string, string>()
    await Promise.all(
      propertyIds.map(async (pid) => {
        const p = await property.get(pid, orgId.value)
        if (p) propMap.set(pid, `${p.addressLine1}, ${p.city}, ${p.state}`)
      }),
    )
    return { rows: list.rows, propMap }
  },
  { server: false, watch: [orgId] },
)

function builderLinkFor(propertyId: string, quoteId: string): string {
  return `/admin/properties/${propertyId}/work-orders/new?quoteId=${encodeURIComponent(quoteId)}`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="wo-quote-picker">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Work orders', to: '/admin/work-orders' },
        { label: 'New work order' },
      ]"
    />

    <header class="mt-2">
      <h1 class="text-display">New work order</h1>
      <p class="text-body text-text-secondary mt-1">
        Work orders are scheduled from accepted quotes. Pick the quote
        you're scheduling.
      </p>
    </header>

    <div v-if="!bundle || bundle.rows.length === 0" class="mt-6">
      <EmptyState
        icon="·"
        title="No accepted quotes yet"
        body="Mark a quote as accepted from its preview page, then come back to schedule a work order."
        :cta="{ label: 'Browse quotes', to: '/admin/quotes' }"
        data-testid="wo-picker-empty"
      />
    </div>

    <ul v-else class="mt-4 flex flex-col gap-3">
      <li
        v-for="q in bundle.rows"
        :key="q.id"
        data-testid="wo-picker-row"
        :data-quote-id="q.id"
      >
        <NuxtLink :to="builderLinkFor(q.propertyId, q.id)" class="block">
          <BulwarkCard padding="md" clickable>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-body font-medium text-text-primary">
                  {{ q.quoteNumber }}
                </p>
                <p class="text-small text-text-secondary truncate">
                  {{ bundle.propMap.get(q.propertyId) ?? '—' }}
                </p>
              </div>
              <span
                class="inline-flex items-center rounded-pill px-2.5 py-1 text-tiny font-medium bg-status-success/10 text-status-success whitespace-nowrap"
              >
                Accepted
              </span>
            </div>
          </BulwarkCard>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
