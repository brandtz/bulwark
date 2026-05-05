<!--
  app/pages/admin/invoices/[id].vue — invoice detail (E8-S2).

  # Decisions (ADR-0008)
    - Single page covers all three persisted states: `draft` shows a
      Send invoice CTA; `sent` shows a Mark paid CTA; `paid` shows the
      paid stamp. The derived `overdue` view is rendered as a
      red-tinted pill when the row qualifies, but the action layout
      stays the same as `sent`.
    - Layout mirrors the quote preview (line items + totals + notes
      cards) so the sponsor's mental model stays consistent.
    - `{ server: false }` asyncData. Mutations via `markSent` /
      `markPaid` round-trip through `refresh()` so the pill flips
      without reload.
    - Mark-paid for v1 records the full `totals.totalCents` as the
      paid amount. Partial payments are deferred to a real payments
      surface.

  # Decision cast down
    - Rejected: an inline edit affordance for the line items. Once an
      invoice is issued it is read-only; corrections happen via a
      void/reissue flow that lands when Stripe lands.
    - Rejected: a separate "void" action. Sponsor never asked for it
      and there is no demo story.
-->
<script setup lang="ts">
import { ROLE_GROUPS } from '~/composables/usePermissions'
import { formatCents } from '~~/shared/utils/money'
import {
  deriveInvoiceView,
  INVOICE_VIEW_LABEL,
  type InvoiceView,
} from '~~/shared/contracts/invoice'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Invoice' })

const route = useRoute()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const invoice = useService('invoice')
const property = useService('property')
const client = useService('client')
const { success: toastSuccess } = useToast()

const invoiceId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle, refresh } = await useAsyncData(
  () => `invoice-detail-${invoiceId.value}-${orgId.value}`,
  async () => {
    const inv = await invoice.get(invoiceId.value, orgId.value)
    if (!inv) return { invoice: null, property: null, client: null }
    const p = await property.get(inv.propertyId, orgId.value)
    const c = p?.clientId ? await client.get(p.clientId, orgId.value) : null
    return { invoice: inv, property: p, client: c }
  },
  { server: false, watch: [invoiceId, orgId] },
)

const propertyAddress = computed(() => {
  const p = bundle.value?.property
  return p ? `${p.addressLine1}, ${p.city}, ${p.state}` : ''
})

const STATUS_TONE: Record<InvoiceView, string> = {
  draft: 'bg-surface-muted text-text-secondary',
  sent: 'bg-status-info/10 text-status-info',
  overdue: 'bg-status-error/10 text-status-error',
  paid: 'bg-status-success/10 text-status-success',
}

const NOW_ISO = new Date().toISOString()
const view = computed<InvoiceView | null>(() => {
  const inv = bundle.value?.invoice
  return inv ? deriveInvoiceView(inv, NOW_ISO) : null
})

const sending = ref(false)
const paying = ref(false)
const serverError = ref('')

async function onMarkSent() {
  if (!bundle.value?.invoice) return
  serverError.value = ''
  sending.value = true
  try {
    await invoice.markSent(bundle.value.invoice.id, orgId.value)
    await refresh()
    const name = bundle.value?.client?.fullName ?? 'customer'
    toastSuccess('Invoice sent', `Sent to ${name}.`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not send invoice.'
  } finally {
    sending.value = false
  }
}

async function onMarkPaid() {
  if (!bundle.value?.invoice) return
  serverError.value = ''
  paying.value = true
  try {
    await invoice.markPaid(bundle.value.invoice.id, orgId.value)
    await refresh()
    toastSuccess('Invoice paid', 'Marked paid in full.')
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not mark invoice paid.'
  } finally {
    paying.value = false
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="p-4 md:p-6 max-w-3xl mx-auto" data-testid="invoice-detail">
    <BulwarkBreadcrumbs
      :items="[
        { label: 'Invoices', to: '/admin/invoices' },
        { label: bundle?.invoice?.invoiceNumber ?? 'Invoice' },
      ]"
    />

    <div v-if="!bundle?.invoice" class="mt-6">
      <EmptyState
        icon="·"
        title="Invoice not found"
        body="This invoice may have been deleted or belongs to another organization."
        :cta="{ label: 'Back to invoices', to: '/admin/invoices' }"
        data-testid="invoice-not-found"
      />
    </div>

    <template v-else>
      <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-display" data-testid="invoice-number">
            {{ bundle.invoice.invoiceNumber }}
          </h1>
          <p v-if="propertyAddress" class="text-body text-text-secondary mt-1">
            {{ propertyAddress }}
          </p>
          <p
            v-if="bundle.client"
            class="text-body text-text-secondary"
            data-testid="invoice-client"
          >
            For {{ bundle.client.fullName }}
          </p>
        </div>
        <span
          v-if="view"
          :class="[
            'inline-flex items-center rounded-pill px-3 py-1 text-small font-medium whitespace-nowrap',
            STATUS_TONE[view],
          ]"
          data-testid="invoice-status"
          :data-status="view"
        >
          {{ INVOICE_VIEW_LABEL[view] }}
        </span>
      </header>

      <!-- Date strip ------------------------------------------------ -->
      <BulwarkCard padding="md" class="mt-4" data-testid="invoice-dates">
        <dl class="grid grid-cols-2 md:grid-cols-4 gap-3 text-small">
          <div>
            <dt class="text-text-secondary">Issued</dt>
            <dd data-testid="invoice-issued-at">
              {{ formatDate(bundle.invoice.issuedAt) || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-text-secondary">Sent</dt>
            <dd data-testid="invoice-sent-at">
              {{ formatDate(bundle.invoice.sentAt) || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-text-secondary">Due</dt>
            <dd data-testid="invoice-due-at">
              {{ formatDate(bundle.invoice.dueAt) || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-text-secondary">Paid</dt>
            <dd data-testid="invoice-paid-at">
              {{ formatDate(bundle.invoice.paidAt) || '—' }}
            </dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Line items ------------------------------------------------ -->
      <section class="mt-6" data-testid="invoice-line-items">
        <h2 class="text-h2 mb-2">Line items</h2>
        <BulwarkCard padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="li in bundle.invoice.lineItems"
              :key="li.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="invoice-line-item"
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
                <span class="text-body">{{ li.quantity }}</span>
              </div>
              <div class="md:col-span-3 flex md:justify-end items-baseline gap-2">
                <span class="md:hidden text-small text-text-secondary">Unit</span>
                <span class="text-body">{{ formatCents(li.unitCostCents) }}</span>
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

      <!-- Totals ---------------------------------------------------- -->
      <BulwarkCard padding="md" class="mt-4" data-testid="invoice-totals">
        <dl class="flex flex-col gap-2 text-body">
          <div class="flex justify-between">
            <dt class="text-text-secondary">Subtotal</dt>
            <dd>{{ formatCents(bundle.invoice.totals.subtotalCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Markup ({{ bundle.invoice.markupPercent }}%)</dt>
            <dd>{{ formatCents(bundle.invoice.totals.markupCents) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Tax ({{ bundle.invoice.taxPercent }}%)</dt>
            <dd>{{ formatCents(bundle.invoice.totals.taxCents) }}</dd>
          </div>
          <div class="flex justify-between border-t border-border-default pt-2 font-medium">
            <dt>Total</dt>
            <dd data-testid="invoice-total">{{ formatCents(bundle.invoice.totals.totalCents) }}</dd>
          </div>
          <div
            v-if="bundle.invoice.status === 'paid'"
            class="flex justify-between text-status-success"
          >
            <dt>Paid amount</dt>
            <dd data-testid="invoice-paid-amount">
              {{ formatCents(bundle.invoice.paidAmountCents) }}
            </dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Notes ----------------------------------------------------- -->
      <section
        v-if="bundle.invoice.notes"
        class="mt-4"
        data-testid="invoice-notes"
      >
        <h2 class="text-h2 mb-2">Internal notes</h2>
        <BulwarkCard padding="md">
          <p class="text-body whitespace-pre-line">{{ bundle.invoice.notes }}</p>
        </BulwarkCard>
      </section>

      <!-- Actions --------------------------------------------------- -->
      <div
        class="mt-6 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2"
        data-testid="invoice-actions"
      >
        <NuxtLink
          to="/admin/invoices"
          class="text-body text-text-secondary hover:text-text-primary self-center"
          data-testid="invoice-back-link"
        >
          Back to invoices
        </NuxtLink>
        <BulwarkButton
          v-if="bundle.invoice.status === 'draft'"
          type="button"
          variant="primary"
          :disabled="sending"
          data-testid="invoice-send-button"
          @click="onMarkSent"
        >
          {{ sending ? 'Sending…' : 'Send invoice' }}
        </BulwarkButton>
        <BulwarkButton
          v-else-if="bundle.invoice.status === 'sent'"
          type="button"
          variant="primary"
          :disabled="paying"
          data-testid="invoice-mark-paid-button"
          @click="onMarkPaid"
        >
          {{ paying ? 'Saving…' : 'Mark paid' }}
        </BulwarkButton>
      </div>

      <p
        v-if="serverError"
        class="mt-3 text-small text-status-error"
        data-testid="invoice-server-error"
      >
        {{ serverError }}
      </p>
    </template>
  </div>
</template>
