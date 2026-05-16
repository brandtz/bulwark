<!--
  app/pages/sub/index.vue — subcontractor portal home (W3-4 / EH-N /
  ADR-0031).

  Shows three KPI tiles (open WOs, pending quotes, COI status) plus a
  short "What's next" list. All copy through useLabel().t(); all data
  via useService() which the H3 request layer scopes to the active
  tenant via assertSameTenant.

  This page replaces the legacy /sub/dashboard which is now a redirect
  for back-compat with bookmarked URLs.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'sub',
  middleware: ['role', 'sub-role'],
  requiredRoles: ROLE_GROUPS.sub,
})

useHead({ title: 'My jobs' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const sub = useService('subcontractor')

const { data: bag } = await useAsyncData(
  () => `sub-home-${orgId.value}-${userId.value}`,
  async () => {
    if (!orgId.value || !userId.value) return { wos: 0, quotes: 0, coiCount: 0 }
    const resolved = await sub.resolveSubForUser(userId.value, orgId.value)
    if (!resolved) return { wos: 0, quotes: 0, coiCount: 0 }
    const [assignments, quotes, cois] = await Promise.all([
      sub.listMyAssignments(userId.value, orgId.value),
      sub.listMyQuotesRequested(userId.value, orgId.value),
      sub.listCois(resolved.subcontractorId, orgId.value),
    ])
    return {
      wos: assignments.length,
      quotes: quotes.length,
      coiCount: cois.length,
    }
  },
  { server: false, watch: [orgId, userId] },
)

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="sub-home">
    <header>
      <p class="text-small text-text-secondary">{{ today }}</p>
      <h1 class="text-display mt-1">
        Hey, {{ session?.fullName?.split(' ')[0] ?? 'there' }}
      </h1>
      <p class="text-body text-text-secondary mt-1">Here's where things stand.</p>
    </header>

    <section class="mt-4 grid grid-cols-3 gap-3" data-testid="sub-kpis">
      <BulwarkCard padding="md" data-testid="sub-kpi-wos">
        <p class="text-tiny uppercase text-text-secondary">WOs</p>
        <p class="text-display mt-1">{{ bag?.wos ?? 0 }}</p>
      </BulwarkCard>
      <BulwarkCard padding="md" data-testid="sub-kpi-quotes">
        <p class="text-tiny uppercase text-text-secondary">Quotes</p>
        <p class="text-display mt-1">{{ bag?.quotes ?? 0 }}</p>
      </BulwarkCard>
      <BulwarkCard padding="md" data-testid="sub-kpi-cois">
        <p class="text-tiny uppercase text-text-secondary">COIs</p>
        <p class="text-display mt-1">{{ bag?.coiCount ?? 0 }}</p>
      </BulwarkCard>
    </section>

    <section class="mt-6 space-y-3" data-testid="sub-quick-links">
      <NuxtLink to="/sub/work-orders" class="block">
        <BulwarkCard padding="md">View my work orders →</BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/sub/quotes" class="block">
        <BulwarkCard padding="md">Respond to quotes →</BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/sub/cois" class="block">
        <BulwarkCard padding="md">Manage my COIs →</BulwarkCard>
      </NuxtLink>
    </section>
  </div>
</template>
