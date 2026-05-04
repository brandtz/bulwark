<!--
  app/pages/admin/properties/[id]/quotes/[quoteId].vue — quote preview (E5-S3).

  # Decisions (ADR-0008)
    - This is the print-friendly preview the GC will hand to the customer.
      It renders the persisted quote (line items + totals + notes) and
      offers a single primary action: `Send`. Sending stamps `sentAt`
      via `quote.markSent` and is idempotent (E5 contract).
    - We deliberately do NOT email anything here. "Send" is a state
      transition; the integration with a real provider lands behind the
      same service in a later epic. For demo purposes we surface a toast
      that the quote was "sent to {client}" so Drew can show the flow.
    - Layout is mobile-first single column. The line-item table becomes a
      vertical card stack <md and a real grid >=md (mirrors the builder).
    - Money is rendered through `formatCents` from the persisted totals;
      we never recompute on the client (the row is the source of truth).
    - Status pill is inline (not via StatusBadge — that is property-status
      specific). Colors come from the `bg-status-*` tokens.

  # Decision cast down
    - Rejected: a separate `<QuotePrintLayout>` component. The print
      stylesheet can layer on top of the same DOM via `@media print` —
      no need for a parallel template.
    - Rejected: editing the quote in place. Once a draft exists, an edit
      is a brand-new quote (per E5-S1 contract notes). The preview page
      is read-only by design.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import type { QuoteStatus } from '~~/shared/contracts/quote'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Quote preview' })

const route = useRoute()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const client = useService('client')
const quote = useService('quote')
const { success: toastSuccess } = useToast()

const propertyId = computed(() => String(route.params.id))
const quoteId = computed(() => String(route.params.quoteId))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle, refresh } = await useAsyncData(
  () => `quote-preview-${quoteId.value}-${orgId.value}`,
  async () => {
    const [q, p] = await Promise.all([
      quote.get(quoteId.value, orgId.value),
      property.get(propertyId.value, orgId.value),
    ])
    const c = p?.clientId ? await client.get(p.clientId, orgId.value) : null
    return { quote: q, property: p, client: c }
  },
  { server: false, watch: [quoteId, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const STATUS_TONE: Record<QuoteStatus, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  sent: 'bg-status-info/10 text-status-info',
  accepted: 'bg-status-success/10 text-status-success',
  rejected: 'bg-status-error/10 text-status-error',
  expired: 'bg-surface-muted text-text-disabled',
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
}

const sending = ref(false)
const serverError = ref('')

async function onSend() {
  if (!bundle.value?.quote) return
  serverError.value = ''
  sending.value = true
  try {
    await quote.markSent(bundle.value.quote.id, orgId.value)
    await refresh()
    const name = bundle.value?.client?.fullName ?? 'customer'
    toastSuccess('Quote sent', `Sent to ${name}.`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not send quote.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="quote-preview">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Properties', to: '/admin/properties' },
        { label: propertyAddress || 'Property', to: `/admin/properties/${propertyId}` },
        { label: bundle?.quote?.quoteNumber ?? 'Quote' },
      ]"
    />

    <div v-if="!bundle?.quote" class="mt-6">
      <EmptyState
        icon="·"
        title="Quote not found"
        body="This quote may have been deleted or belongs to another organization."
        :cta="{ label: 'Back to property', to: `/admin/properties/${propertyId}?tab=quotes` }"
        data-testid="quote-not-found"
      />
    </div>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-display" data-testid="quote-number">
            {{ bundle.quote.quoteNumber }}
          </h1>
          <p v-if="propertyAddress" class="text-body text-text-secondary mt-1">
            {{ propertyAddress }}
          </p>
          <p
            v-if="bundle.client"
            class="text-body text-text-secondary"
            data-testid="quote-client"
          >
            For {{ bundle.client.fullName }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex items-center rounded-pill px-3 py-1 text-small font-medium whitespace-nowrap',
            STATUS_TONE[bundle.quote.status],
          ]"
          data-testid="quote-status"
          :data-status="bundle.quote.status"
        >
          {{ STATUS_LABEL[bundle.quote.status] }}
        </span>
      </header>

      <!-- Line items ------------------------------------------------ -->
      <section class="mt-6" data-testid="quote-line-items">
        <h2 class="text-h2 mb-2">Line items</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="li in bundle.quote.lineItems"
              :key="li.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="preview-line-item"
            >
              <div class="md:col-span-7">
                <p class="text-body font-medium text-text-primary">
                  {{ li.description }}
                </p>
                <p class="text-tiny uppercase tracking-wide text-text-secondary mt-0.5">
                  {{ li.kind }}
                </p>
              </div>
              <div class="md:col-span-2 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Qty</span>
                <span class="text-body" data-testid="preview-line-qty">{{ li.quantity }}</span>
              </div>
              <div class="md:col-span-3 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Unit</span>
                <span class="text-body" data-testid="preview-line-unit">{{ formatCents(li.unitCostCents) }}</span>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Totals ---------------------------------------------------- -->
      <BulwarkCard padding="md" class="mt-4" data-testid="preview-totals">
        <dl class="flex flex-col gap-2 text-body">
          <div class="flex justify-between">
            <dt class="text-text-secondary">Subtotal</dt>
            <dd data-testid="preview-totals-subtotal">{{ formatCents(bundle.quote.totals.subtotalCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Markup ({{ bundle.quote.markupPercent }}%)</dt>
            <dd data-testid="preview-totals-markup">{{ formatCents(bundle.quote.totals.markupCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Tax ({{ bundle.quote.taxPercent }}%)</dt>
            <dd data-testid="preview-totals-tax">{{ formatCents(bundle.quote.totals.taxCents) }}</dd>
          </div>
          <div class="flex justify-between border-t border-border-default pt-2 font-medium">
            <dt>Total</dt>
            <dd data-testid="preview-totals-total">{{ formatCents(bundle.quote.totals.totalCents) }}</dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Notes ----------------------------------------------------- -->
      <section
        v-if="bundle.quote.notes"
        class="mt-4"
        data-testid="preview-notes"
      >
        <h2 class="text-h2 mb-2">Internal notes</h2>
        <BulwarkCard padding="md">
          <p class="text-body whitespace-pre-line">{{ bundle.quote.notes }}</p>
        </BulwarkCard>
      </section>

      <!-- Actions --------------------------------------------------- -->
      <div class="mt-6 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2">
        <NuxtLink
          :to="`/admin/properties/${propertyId}?tab=quotes`"
          class="text-body text-text-secondary hover:text-text-primary self-center"
          data-testid="preview-back-link"
        >
          Back to property
        </NuxtLink>
        <BulwarkButton
          v-if="bundle.quote.status === 'draft'"
          type="button"
          variant="primary"
          :disabled="sending"
          data-testid="send-button"
          @click="onSend"
        >
          {{ sending ? 'Sending…' : 'Send quote' }}
        </BulwarkButton>
        <p
          v-else
          class="text-body text-text-secondary"
          data-testid="already-sent-note"
        >
          Quote already sent.
        </p>
      </div>

      <p
        v-if="serverError"
        class="mt-2 text-small text-status-error"
        data-testid="server-error"
      >
        {{ serverError }}
      </p>
    </template>
  </div>
</template>
