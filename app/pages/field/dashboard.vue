<!--
  app/pages/field/dashboard.vue — field GC's mobile-first home (E10-S1).

  # Decisions (ADR-0008)
    - This is the FIRST screen a `field` user lands on (root index
      redirect carries them here). Everything must answer "what
      am I doing today" in one tap.
    - Layout is single-column, mobile-first. KPIs come from real
      mock data: count of active properties + count of in-flight
      WOs in the active org. We deliberately omit any dollar
      metric — Drew's UX is field-of-work, not financial.

  # Decision cast down
    - Rejected: cards listing every WO. The dashboard is a
      decision surface, not a directory; the All work orders link
      goes there.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.field,
})

useHead({ title: 'Today' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const property = useService('property')
const workOrder = useService('workOrder')

const { data: kpis } = await useAsyncData(
  () => `field-dashboard-${orgId.value}`,
  async () => {
    const [props, wos] = await Promise.all([
      property.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
      workOrder.list({ organizationId: orgId.value, page: 1, pageSize: 200 }),
    ])
    const activeProperties = props.rows.filter(
      (p) => p.status !== 'paid' && p.status !== 'cancelled',
    ).length
    const openWorkOrders = wos.rows.filter(
      (w) => w.status === 'scheduled' || w.status === 'in_progress',
    ).length
    return { activeProperties, openWorkOrders }
  },
  { server: false, watch: [orgId] },
)

const today = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-dashboard">
    <header>
      <p class="text-small text-text-secondary">{{ today }}</p>
      <h1 class="text-display mt-1">
        Hey, {{ session?.fullName?.split(' ')[0] ?? 'there' }}
      </h1>
      <p class="text-body text-text-secondary mt-1">
        Here's what's open today.
      </p>
    </header>

    <section class="mt-4 grid grid-cols-2 gap-3" data-testid="field-kpis">
      <BulwarkCard padding="md" data-testid="field-kpi-properties">
        <p class="text-tiny uppercase text-text-secondary">Active properties</p>
        <p class="text-display mt-1">{{ kpis?.activeProperties ?? 0 }}</p>
      </BulwarkCard>
      <BulwarkCard padding="md" data-testid="field-kpi-work-orders">
        <p class="text-tiny uppercase text-text-secondary">Open jobs</p>
        <p class="text-display mt-1">{{ kpis?.openWorkOrders ?? 0 }}</p>
      </BulwarkCard>
    </section>

    <section class="mt-6 flex flex-col gap-3" data-testid="field-quick-links">
      <NuxtLink to="/field/properties" class="block" data-testid="field-link-properties">
        <BulwarkCard padding="md" clickable>
          <p class="text-body font-medium">My properties</p>
          <p class="text-small text-text-secondary mt-1">
            Walk a site, run an assessment.
          </p>
        </BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/field/work-orders" class="block" data-testid="field-link-work-orders">
        <BulwarkCard padding="md" clickable>
          <p class="text-body font-medium">My jobs</p>
          <p class="text-small text-text-secondary mt-1">
            Update progress on assigned work.
          </p>
        </BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/field/assessments" class="block" data-testid="field-link-assessments">
        <BulwarkCard padding="md" clickable>
          <p class="text-body font-medium">Recent assessments</p>
          <p class="text-small text-text-secondary mt-1">
            Review what you've already captured.
          </p>
        </BulwarkCard>
      </NuxtLink>
      <NuxtLink to="/field/sync-queue" class="block" data-testid="field-link-sync">
        <BulwarkCard padding="md" clickable>
          <p class="text-body font-medium">Sync queue</p>
          <p class="text-small text-text-secondary mt-1">
            Offline mode lands in Phase 2.
          </p>
        </BulwarkCard>
      </NuxtLink>
    </section>
  </div>
</template>
