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
import { formatCents, parseDollarsToCents } from '~~/shared/utils/money'
import {
  deriveInvoiceView,
  INVOICE_VIEW_LABEL,
  type InvoiceView,
} from '~~/shared/contracts/invoice'
import type {
  InvoicePayment,
  InvoicePaymentMethod,
} from '~~/shared/contracts/invoice-payment'

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
const invoicePayment = useService('invoicePayment')
const { success: toastSuccess } = useToast()
const { t: tLabel } = useLabel()

const invoiceId = computed(() => String(route.params.id))
const orgId = computed(() => session.value?.activeOrganizationId ?? '')

const { data: bundle, refresh } = await useAsyncData(
  () => `invoice-detail-${invoiceId.value}-${orgId.value}`,
  async () => {
    const inv = await invoice.get(invoiceId.value, orgId.value)
    if (!inv) return { invoice: null, property: null, client: null, payments: [] as InvoicePayment[] }
    const [p, payments] = await Promise.all([
      property.get(inv.propertyId, orgId.value),
      invoicePayment.listForInvoice(inv.id, orgId.value),
    ])
    const c = p?.clientId ? await client.get(p.clientId, orgId.value) : null
    return { invoice: inv, property: p, client: c, payments }
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
  partial: 'bg-status-warning/10 text-status-warning',
  overdue: 'bg-status-error/10 text-status-error',
  paid: 'bg-status-success/10 text-status-success',
  voided: 'bg-surface-muted text-text-tertiary line-through',
}

const PAYMENT_METHOD_OPTIONS: { value: InvoicePaymentMethod; label: string }[] = [
  { value: 'check', label: tLabel('invoice-payment.methods', 'check', 'Check') },
  { value: 'ach', label: tLabel('invoice-payment.methods', 'ach', 'ACH') },
  { value: 'card', label: tLabel('invoice-payment.methods', 'card', 'Card') },
  { value: 'cash', label: tLabel('invoice-payment.methods', 'cash', 'Cash') },
  { value: 'wire', label: tLabel('invoice-payment.methods', 'wire', 'Wire') },
  { value: 'other', label: tLabel('invoice-payment.methods', 'other', 'Other') },
]

const NOW_ISO = new Date().toISOString()
const view = computed<InvoiceView | null>(() => {
  const inv = bundle.value?.invoice
  return inv ? deriveInvoiceView(inv, NOW_ISO) : null
})

const statusLabel = computed(() =>
  view.value ? tLabel('status.invoice', view.value, INVOICE_VIEW_LABEL[view.value]) : '',
)

const balance = computed(() => {
  const inv = bundle.value?.invoice
  if (!inv) return { total: 0, paid: 0, remaining: 0, retainageHeld: 0 }
  const total = inv.totals.totalCents
  const paid = inv.paidAmountCents
  const remaining = Math.max(0, total - paid)
  const retainageBps = inv.retainageBps ?? 0
  const retainageReleased = inv.retainageReleasedCents ?? 0
  const retainageHeld = Math.max(
    0,
    Math.round((total * retainageBps) / 10_000) - retainageReleased,
  )
  return { total, paid, remaining, retainageHeld }
})

const sending = ref(false)
const paying = ref(false)
const serverError = ref('')

// Record-payment modal state.
const paymentOpen = ref(false)
const paymentAmount = ref('')
const paymentMethod = ref<InvoicePaymentMethod>('check')
const paymentReference = ref('')
const paymentNotes = ref('')
const paymentReceivedAt = ref(new Date().toISOString().slice(0, 10))
const paymentSubmitting = ref(false)

function openRecordPayment() {
  paymentAmount.value = (balance.value.remaining / 100).toFixed(2)
  paymentMethod.value = 'check'
  paymentReference.value = ''
  paymentNotes.value = ''
  paymentReceivedAt.value = new Date().toISOString().slice(0, 10)
  paymentOpen.value = true
}

async function submitPayment() {
  if (!bundle.value?.invoice) return
  serverError.value = ''
  paymentSubmitting.value = true
  try {
    const amountCents = parseDollarsToCents(paymentAmount.value) ?? 0
    await invoice.recordPayment({
      invoiceId: bundle.value.invoice.id,
      organizationId: orgId.value,
      amountCents,
      method: paymentMethod.value,
      reference: paymentReference.value.trim() || null,
      notes: paymentNotes.value.trim() || null,
      receivedAt: new Date(`${paymentReceivedAt.value}T12:00:00.000Z`).toISOString(),
      recordedByUserId: session.value?.userId ?? null,
    })
    paymentOpen.value = false
    await refresh()
    toastSuccess('Payment recorded', `${formatCents(amountCents)} applied.`)
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not record payment.'
  } finally {
    paymentSubmitting.value = false
  }
}

// Void modal state.
const voidOpen = ref(false)
const voidReason = ref('')
const voidSubmitting = ref(false)

function openVoid() {
  voidReason.value = ''
  voidOpen.value = true
}

async function submitVoid() {
  if (!bundle.value?.invoice) return
  serverError.value = ''
  voidSubmitting.value = true
  try {
    await invoice.voidInvoice({
      invoiceId: bundle.value.invoice.id,
      organizationId: orgId.value,
      reason: voidReason.value.trim() || 'voided',
    })
    voidOpen.value = false
    await refresh()
    toastSuccess('Invoice voided', 'Status updated.')
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not void invoice.'
  } finally {
    voidSubmitting.value = false
  }
}

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
        { label: 'Properties', to: '/admin/properties' },
        bundle?.invoice
          ? { label: bundle.property?.addressLine1 ?? 'Property', to: `/admin/properties/${bundle.invoice.propertyId}` }
          : { label: 'Invoices', to: '/admin/invoices' },
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
          {{ statusLabel }}
        </span>
      </header>

      <!-- EH-D / W1-4: Linked work back-references. -->
      <BulwarkCard padding="md" class="mt-4" data-testid="invoice-linked">
        <h2 class="text-h2 mb-2">Linked work</h2>
        <ul class="text-body space-y-1">
          <li>
            Property:
            <NuxtLink
              :to="`/admin/properties/${bundle.invoice.propertyId}`"
              class="text-primary hover:underline"
              data-testid="link-to-property"
            >
              {{ bundle.property?.addressLine1 ?? 'View property' }}
            </NuxtLink>
          </li>
          <li v-if="bundle.invoice.workOrderId">
            Source work order:
            <NuxtLink
              :to="`/admin/work-orders/${bundle.invoice.workOrderId}`"
              class="text-primary hover:underline"
              data-testid="link-to-source-work-order"
            >
              View work order
            </NuxtLink>
          </li>
          <li v-if="bundle.invoice.quoteId">
            Source quote:
            <NuxtLink
              :to="`/admin/properties/${bundle.invoice.propertyId}/quotes/${bundle.invoice.quoteId}`"
              class="text-primary hover:underline"
              data-testid="link-to-source-quote"
            >
              View quote
            </NuxtLink>
          </li>
        </ul>
      </BulwarkCard>

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

      <!-- Balance summary (W2-3b) ---------------------------------- -->
      <BulwarkCard padding="md" class="mt-4" data-testid="balance-summary">
        <h2 class="text-h2 mb-2">Balance</h2>
        <dl class="flex flex-col gap-2 text-body">
          <div class="flex justify-between">
            <dt class="text-text-secondary">Total</dt>
            <dd data-testid="balance-total">{{ formatCents(balance.total) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-text-secondary">Payments applied</dt>
            <dd data-testid="balance-paid">{{ formatCents(balance.paid) }}</dd>
          </div>
          <div
            v-if="balance.retainageHeld > 0"
            class="flex justify-between text-text-secondary"
          >
            <dt>Retainage held</dt>
            <dd data-testid="balance-retainage">{{ formatCents(balance.retainageHeld) }}</dd>
          </div>
          <div class="flex justify-between border-t border-border-default pt-2 font-medium">
            <dt>Balance remaining</dt>
            <dd data-testid="balance-remaining">{{ formatCents(balance.remaining) }}</dd>
          </div>
        </dl>
      </BulwarkCard>

      <!-- Payments ledger (W2-3b) ---------------------------------- -->
      <section class="mt-6" data-testid="payments-panel">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-h2">Payments</h2>
          <BulwarkButton
            v-if="view !== 'voided' && view !== 'draft'"
            type="button"
            variant="secondary"
            size="sm"
            data-testid="record-payment-button"
            @click="openRecordPayment"
          >
            Record payment
          </BulwarkButton>
        </div>
        <BulwarkCard v-if="bundle.payments.length === 0" padding="md">
          <p class="text-body text-text-secondary" data-testid="payments-empty">
            No payments recorded yet.
          </p>
        </BulwarkCard>
        <BulwarkCard v-else padding="none">
          <ul class="divide-y divide-border-default">
            <li
              v-for="p in bundle.payments"
              :key="p.id"
              class="p-3 md:p-4 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4"
              data-testid="payment-row"
              :data-payment-id="p.id"
            >
              <div class="md:col-span-3">
                <p class="text-body font-medium" data-testid="payment-row-amount">
                  {{ formatCents(p.amountCents) }}
                </p>
                <p class="text-tiny uppercase tracking-wide text-text-secondary mt-0.5">
                  {{ tLabel('invoice-payment.methods', p.method, p.method) }}
                </p>
              </div>
              <div class="md:col-span-3 text-body text-text-secondary">
                {{ formatDate(p.receivedAt) }}
              </div>
              <div class="md:col-span-3 text-body text-text-secondary">
                {{ p.reference || '—' }}
              </div>
              <div class="md:col-span-3 text-body text-text-secondary">
                {{ p.notes || '' }}
              </div>
            </li>
          </ul>
        </BulwarkCard>
      </section>

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
          v-if="view && view !== 'voided' && view !== 'draft' && view !== 'paid'"
          type="button"
          variant="secondary"
          data-testid="void-button"
          @click="openVoid"
        >
          Void
        </BulwarkButton>
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

    <!-- Record-payment modal --------------------------------------- -->
    <BulwarkModal
      v-model="paymentOpen"
      title="Record payment"
      size="md"
      data-testid="record-payment-modal"
    >
      <div class="flex flex-col gap-3">
        <BulwarkInput
          v-model="paymentAmount"
          label="Amount ($)"
          inputmode="decimal"
          placeholder="0.00"
          data-testid="payment-amount-input"
        />
        <BulwarkSelect
          v-model="paymentMethod"
          label="Method"
          :options="PAYMENT_METHOD_OPTIONS"
          data-testid="payment-method-select"
        />
        <BulwarkInput
          v-model="paymentReference"
          label="Reference (cheque #, ACH trace, …)"
          data-testid="payment-reference-input"
        />
        <BulwarkInput
          v-model="paymentReceivedAt"
          type="date"
          label="Received"
          data-testid="payment-received-input"
        />
        <BulwarkTextarea
          v-model="paymentNotes"
          label="Notes"
          :rows="3"
          data-testid="payment-notes-input"
        />
      </div>
      <template #footer>
        <BulwarkButton variant="secondary" @click="paymentOpen = false">Cancel</BulwarkButton>
        <BulwarkButton
          variant="primary"
          :disabled="paymentSubmitting"
          data-testid="payment-submit-button"
          @click="submitPayment"
        >
          {{ paymentSubmitting ? 'Saving…' : 'Record payment' }}
        </BulwarkButton>
      </template>
    </BulwarkModal>

    <!-- Void invoice modal ----------------------------------------- -->
    <BulwarkModal
      v-model="voidOpen"
      title="Void invoice"
      size="md"
      data-testid="void-modal"
    >
      <div class="flex flex-col gap-3">
        <p class="text-body text-text-secondary">
          Voiding is terminal. Payments are preserved on the ledger.
        </p>
        <BulwarkTextarea
          v-model="voidReason"
          label="Reason"
          :rows="4"
          data-testid="void-reason-input"
        />
      </div>
      <template #footer>
        <BulwarkButton variant="secondary" @click="voidOpen = false">Cancel</BulwarkButton>
        <BulwarkButton
          variant="primary"
          :disabled="voidSubmitting"
          data-testid="void-submit-button"
          @click="submitVoid"
        >
          {{ voidSubmitting ? 'Saving…' : 'Void' }}
        </BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
