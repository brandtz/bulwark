<!--
  pages/admin/dashboard.vue — placeholder admin home.

  Confirms the AppLayout shell renders correctly with a real interior page.
  E3 replaces this with the property pipeline kanban as the default admin
  landing surface.
-->
<script setup lang="ts">
import type { Property, PropertyStatus } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'

useHead({ title: 'Dashboard' })

const { session } = useSession()
const property = useService('property')

// Pull all properties (mock returns up to pageSize 200) so we can group by
// status. In E3 this becomes a proper kanban with virtualization.
const { data } = await useAsyncData('admin.dashboard.properties', async () => {
  if (!session.value) return { rows: [] as Property[], total: 0 }
  return property.list({
    organizationId: session.value.activeOrganizationId,
    page: 1,
    pageSize: 100,
  })
})

const byStatus = computed(() => {
  const map = new Map<PropertyStatus, Property[]>()
  for (const p of (data.value?.rows ?? [])) {
    const list = map.get(p.status) ?? []
    list.push(p)
    map.set(p.status, list)
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
})

const totalProps = computed(() => data.value?.total ?? 0)
</script>

<template>
  <div class="p-4 md:p-6">
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Welcome back, {{ session?.fullName?.split(' ')[0] }}</h1>
        <p class="text-body text-text-secondary mt-1">
          {{ totalProps }} active {{ totalProps === 1 ? 'property' : 'properties' }} across your pipeline.
        </p>
      </div>
      <BulwarkButton size="md">New property</BulwarkButton>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <BulwarkCard v-for="[status, items] in byStatus" :key="status">
        <div class="flex items-center justify-between mb-3">
          <StatusBadge :status="status" />
          <span class="text-tiny text-text-secondary">{{ items.length }}</span>
        </div>
        <ul class="space-y-2">
          <li
            v-for="p in items.slice(0, 4)"
            :key="p.id"
            class="text-body text-text-primary truncate"
          >
            {{ p.addressLine1 }} <span class="text-text-secondary">· {{ p.city }}</span>
          </li>
          <li v-if="items.length > 4" class="text-small text-text-secondary">
            +{{ items.length - 4 }} more
          </li>
        </ul>
      </BulwarkCard>
    </div>

    <p class="text-small text-text-disabled mt-8 text-center">
      Pipeline kanban + property detail land in Epic E3. Compliance, quotes, work orders follow in E4–E8.
    </p>
  </div>
</template>
