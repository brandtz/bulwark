<!--
  app/pages/sub/work-orders.vue — list WOs assigned to the signed-in
  sub (W3-4 / EH-N / ADR-0031).

  # Decisions
    - Uses `listMyAssignments(userId, orgId)` so the tenant firewall
      can scope rows server-side; UI does not pass a sub id directly.
    - Rows are unknown[] in the contract because the join needed to
      return strongly-typed work orders is expensive in the mock and
      the UI only shows id/title/status. We narrow with a runtime
      shape guard rather than `as` casts.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

useHead({ title: 'My work orders' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const sub = useService('subcontractor')

type WoRow = { id: string; title?: string; status?: string }

function narrow(rows: unknown[]): WoRow[] {
  return rows.map((r) => {
    const o = r as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      title: typeof o.title === 'string' ? o.title : undefined,
      status: typeof o.status === 'string' ? o.status : undefined,
    }
  })
}

const { data: rows } = await useAsyncData(
  () => `sub-wos-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return [] as WoRow[]
    const raw = await sub.listMyAssignments(userId.value, orgId.value)
    return narrow(raw)
  },
  { server: false, watch: [orgId, userId] },
)
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="sub-wos">
    <h1 class="text-display">My work orders</h1>
    <p class="text-body text-text-secondary mt-1">
      Jobs assigned to your team.
    </p>

    <ul v-if="rows && rows.length" class="mt-4 space-y-2">
      <li v-for="row in rows" :key="row.id" :data-testid="`sub-wo-${row.id}`">
        <BulwarkCard padding="md">
          <p class="text-body font-medium">{{ row.title || row.id }}</p>
          <p class="text-small text-text-secondary mt-1">{{ row.status || 'scheduled' }}</p>
        </BulwarkCard>
      </li>
    </ul>
    <EmptyState
      v-else
      data-testid="sub-wos-empty"
      title="No work orders yet"
      :body="`You'll see new jobs here once they're assigned.`"
    />
  </div>
</template>
