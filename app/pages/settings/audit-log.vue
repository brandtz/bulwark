<!--
  app/pages/settings/audit-log.vue — read-only org-wide audit viewer (E9-S8).

  # Decisions (ADR-0008)
    - In v1 we synthesize an audit-log feed by walking the existing
      domain rows (properties, quotes, work orders, invoices) and
      emitting a `created` event per row + an `updated` event when
      `updatedAt > createdAt`. This mirrors what the real audit
      service will surface in E11 without standing up a separate
      MockAuditService that needs its own write path on every
      mutation.
    - The view is purely read-only: a sortable list with kind +
      timestamp + actor (when known). Filters land when sponsor
      asks.

  # Decision cast down
    - Rejected: surfacing a mock "log writer" service that every
      domain mock would have to call. The dual-write would drift
      the moment anyone forgot a hook; deriving from row history
      keeps the feed honest.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Audit log' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const propertyService = useService('property')
const quoteService = useService('quote')
const workOrderService = useService('workOrder')
const invoiceService = useService('invoice')

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

interface AuditEvent {
  kind: 'property' | 'quote' | 'workOrder' | 'invoice'
  action: 'created' | 'updated'
  ref: string
  at: string
}

const { data: events } = await useAsyncData(
  () => `audit-log-${orgId.value}`,
  async () => {
    const [props, quotes, wos, invoices] = await Promise.all([
      propertyService.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      quoteService.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      workOrderService.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      invoiceService.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
    ])

    const out: AuditEvent[] = []
    for (const p of props.rows) {
      out.push({ kind: 'property', action: 'created', ref: p.addressLine1, at: p.createdAt })
      if (p.updatedAt && p.updatedAt !== p.createdAt) {
        out.push({ kind: 'property', action: 'updated', ref: p.addressLine1, at: p.updatedAt })
      }
    }
    for (const q of quotes.rows) {
      out.push({ kind: 'quote', action: 'created', ref: q.quoteNumber, at: q.createdAt })
      if (q.updatedAt && q.updatedAt !== q.createdAt) {
        out.push({ kind: 'quote', action: 'updated', ref: q.quoteNumber, at: q.updatedAt })
      }
    }
    for (const w of wos.rows) {
      out.push({ kind: 'workOrder', action: 'created', ref: w.workOrderNumber, at: w.createdAt })
      if (w.updatedAt && w.updatedAt !== w.createdAt) {
        out.push({ kind: 'workOrder', action: 'updated', ref: w.workOrderNumber, at: w.updatedAt })
      }
    }
    for (const inv of invoices.rows) {
      out.push({ kind: 'invoice', action: 'created', ref: inv.invoiceNumber, at: inv.createdAt })
      if (inv.updatedAt && inv.updatedAt !== inv.createdAt) {
        out.push({ kind: 'invoice', action: 'updated', ref: inv.invoiceNumber, at: inv.updatedAt })
      }
    }

    out.sort((a, b) => b.at.localeCompare(a.at))
    return out
  },
  { server: false, watch: [orgId] },
)

const KIND_LABEL: Record<AuditEvent['kind'], string> = {
  property: 'Property',
  quote: 'Quote',
  workOrder: 'Work order',
  invoice: 'Invoice',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="settings-audit-log">
    <BulwarkBreadcrumbs
      :items="[{ label: 'Settings', to: '/settings' }, { label: 'Audit log' }]"
    />
    <header class="mt-2">
      <h1 class="text-display">Audit log</h1>
      <p class="text-body text-text-secondary mt-1">
        Read-only feed of writes across the org.
      </p>
    </header>

    <BulwarkCard v-if="!events || events.length === 0" padding="md" class="mt-6">
      <p class="text-body text-text-secondary" data-testid="audit-empty">
        No activity yet.
      </p>
    </BulwarkCard>

    <BulwarkCard v-else padding="none" class="mt-6">
      <ul class="divide-y divide-border-default">
        <li
          v-for="(ev, i) in events"
          :key="`${ev.kind}-${ev.action}-${ev.ref}-${i}`"
          class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2"
          data-testid="audit-row"
        >
          <div class="md:col-span-3 text-small text-text-secondary">
            {{ formatTimestamp(ev.at) }}
          </div>
          <div class="md:col-span-3">
            <span
              class="inline-flex items-center rounded-pill bg-status-info/10 text-status-info px-2.5 py-1 text-tiny font-medium"
            >{{ KIND_LABEL[ev.kind] }}</span>
            <span class="ml-2 text-small text-text-secondary">{{ ev.action }}</span>
          </div>
          <div class="md:col-span-6 text-body text-text-primary truncate">
            {{ ev.ref }}
          </div>
        </li>
      </ul>
    </BulwarkCard>
  </div>
</template>
