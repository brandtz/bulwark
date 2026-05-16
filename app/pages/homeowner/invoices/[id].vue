<!--
  app/pages/homeowner/invoices/[id].vue — read-only invoice detail
  (W3-4 / W4-1 / EH-O).

  # Decisions — see [id].vue in the sibling quotes folder.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'

definePageMeta({
  layout: 'homeowner',
  middleware: ['role', 'homeowner-role'],
  requiredRoles: ROLE_GROUPS.homeowner,
})

const route = useRoute()
const invoiceId = computed(() => String(route.params.id ?? ''))

const { session, ensureLoaded } = useSession()
await ensureLoaded()
const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const invoiceService = useService('invoice')
const { t } = useLabel()

const { data: invoice } = await useAsyncData(
  () => `ho-invoice-${invoiceId.value}-${orgId.value}`,
  async () => {
    if (!orgId.value || !invoiceId.value) return null
    return await invoiceService.get(invoiceId.value, orgId.value)
  },
  { server: false, watch: [invoiceId, orgId] },
)

useHead({ title: () => (invoice.value ? `Invoice ${invoice.value.invoiceNumber}` : 'Invoice') })

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

onMounted(async () => {
  if (!invoiceId.value) return
  try {
    await $fetch(`/api/homeowner/invoices/${invoiceId.value}/viewed`, { method: 'POST' })
  } catch {
    // best-effort
  }
})
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="homeowner-invoice-detail">
    <div v-if="invoice">
      <h1 class="text-display" data-testid="ho-invoice-number">{{ invoice.invoiceNumber }}</h1>
      <p class="text-small text-text-secondary mt-1">{{ invoice.status }}</p>

      <BulwarkCard padding="md" class="mt-4">
        <p class="text-h2">Amount due</p>
        <p class="text-display mt-1" data-testid="ho-invoice-total">{{ dollars(invoice.totals.totalCents) }}</p>
      </BulwarkCard>

      <h2 class="text-h2 mt-6">Line items</h2>
      <ul class="mt-2 space-y-2">
        <li
          v-for="li in invoice.lineItems"
          :key="li.id"
          class="rounded-card border border-border bg-surface px-3 py-2"
          data-testid="ho-invoice-line"
        >
          <p class="text-body">{{ li.description }}</p>
          <p class="text-small text-text-secondary mt-1">
            {{ li.quantity }} × {{ dollars(li.unitCostCents) }}
          </p>
        </li>
      </ul>

      <p class="mt-6 text-tiny text-text-secondary" data-testid="ho-invoice-download-hint">
        {{ t('homeowner.invoice', 'download-pdf', 'PDF download coming soon.') }}
      </p>
    </div>
    <EmptyState
      v-else
      data-testid="ho-invoice-empty"
      title="Invoice not found"
      body="This invoice may have been removed or is not visible to you."
    />
  </div>
</template>
