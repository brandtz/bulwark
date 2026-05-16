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
import type {
  QuoteStatus,
  QuoteTier,
  QuoteRejectedReasonCode,
} from '~~/shared/contracts/quote'

definePageMeta({
  middleware: ['role'],
  requiredRoles: ROLE_GROUPS.admin,
})

useHead({ title: 'Quote preview' })

const route = useRoute()
const router = useRouter()
const { session, ensureLoaded } = useSession()
await ensureLoaded()

const property = useService('property')
const client = useService('client')
const quote = useService('quote')
const { success: toastSuccess } = useToast()
const { t: tLabel } = useLabel()

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

function statusCopy(s: QuoteStatus): string {
  return tLabel('status.quote', s, STATUS_LABEL[s])
}
function tierCopy(t: QuoteTier): string {
  return tLabel('quote.tiers', t, t.charAt(0).toUpperCase() + t.slice(1))
}

const REASON_CODES: QuoteRejectedReasonCode[] = [
  'price',
  'scope',
  'timing',
  'competitor',
  'unresponsive',
  'other',
]

// Expiry banner state — derived from sent + expiryDate proximity.
type ExpiryView = { kind: 'warning' | 'error'; message: string } | null
const expiryView = computed<ExpiryView>(() => {
  const q = bundle.value?.quote
  if (!q || q.status !== 'sent' || !q.expiryDate) return null
  const exp = new Date(q.expiryDate).getTime()
  const now = Date.now()
  const days = Math.ceil((exp - now) / 86_400_000)
  if (days < 0) return { kind: 'error', message: `Expired ${-days} day${-days === 1 ? '' : 's'} ago` }
  if (days <= 7) return { kind: 'warning', message: `Expires in ${days} day${days === 1 ? '' : 's'}` }
  return null
})

const sending = ref(false)
const accepting = ref(false)
const revising = ref(false)
const rejectOpen = ref(false)
const rejecting = ref(false)
const rejectReason = ref('')
const rejectCode = ref<QuoteRejectedReasonCode>('price')
const expiring = ref(false)
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

async function onAccept() {
  if (!bundle.value?.quote) return
  serverError.value = ''
  accepting.value = true
  try {
    await quote.markAccepted(bundle.value.quote.id, orgId.value)
    await refresh()
    toastSuccess('Quote accepted', 'You can now create a work order.')
  } catch (err: unknown) {
    serverError.value =
      err instanceof Error ? err.message : 'Could not accept quote.'
  } finally {
    accepting.value = false
  }
}

async function onRevise() {
  if (!bundle.value?.quote) return
  serverError.value = ''
  revising.value = true
  try {
    const next = await quote.revise(bundle.value.quote.id, orgId.value)
    toastSuccess('Revision created', `Now editing revision ${next.revisionNumber ?? '?'}.`)
    await router.push(`/admin/properties/${propertyId.value}/quotes/${next.id}`)
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not revise.'
  } finally {
    revising.value = false
  }
}

function openReject() {
  rejectReason.value = ''
  rejectCode.value = 'price'
  rejectOpen.value = true
}

async function submitReject() {
  if (!bundle.value?.quote) return
  serverError.value = ''
  rejecting.value = true
  try {
    await quote.reject({
      id: bundle.value.quote.id,
      organizationId: orgId.value,
      reason: rejectReason.value.trim() || rejectCode.value,
      reasonCode: rejectCode.value,
    })
    await refresh()
    toastSuccess('Quote rejected', 'Reason captured.')
    rejectOpen.value = false
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not reject.'
  } finally {
    rejecting.value = false
  }
}

async function onExpireNow() {
  if (!bundle.value?.quote) return
  serverError.value = ''
  expiring.value = true
  try {
    if (typeof (quote as { expire?: unknown }).expire === 'function') {
      await (quote as unknown as {
        expire: (id: string, orgId: string) => Promise<unknown>
      }).expire(bundle.value.quote.id, orgId.value)
    } else {
      // Fallback to batch — service filters by expiryDate < now.
      await quote.expireBatch({ organizationId: orgId.value })
    }
    await refresh()
    toastSuccess('Quote expired', 'Marked as expired.')
  } catch (err: unknown) {
    serverError.value = err instanceof Error ? err.message : 'Could not expire.'
  } finally {
    expiring.value = false
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
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center rounded-pill bg-primary/10 text-primary px-2.5 py-0.5 text-tiny font-medium"
              data-testid="quote-tier-badge"
              :data-tier="bundle.quote.tier ?? 'custom'"
            >
              {{ tierCopy(bundle.quote.tier ?? 'custom') }}
            </span>
            <span
              v-if="(bundle.quote.revisionNumber ?? 1) > 1"
              class="inline-flex items-center rounded-pill bg-status-warning/10 text-status-warning px-2.5 py-0.5 text-tiny font-medium"
              data-testid="quote-revision-badge"
            >
              Revision {{ bundle.quote.revisionNumber }}
            </span>
          </div>
        </div>
        <span
          :class="[
            'inline-flex items-center rounded-pill px-3 py-1 text-small font-medium whitespace-nowrap',
            STATUS_TONE[bundle.quote.status],
          ]"
          data-testid="quote-status"
          :data-status="bundle.quote.status"
        >
          {{ statusCopy(bundle.quote.status) }}
        </span>
      </header>

      <!-- Expiry banner (W2-3b) -->
      <div
        v-if="expiryView"
        :class="[
          'mt-4 rounded-card px-3 py-2 text-small',
          expiryView.kind === 'warning'
            ? 'bg-status-warning/10 text-status-warning'
            : 'bg-status-error/10 text-status-error',
        ]"
        data-testid="quote-expiry-banner"
        :data-kind="expiryView.kind"
      >
        {{ expiryView.message }}
      </div>

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
              :data-optional="li.optional ? 'true' : 'false'"
            >
              <div class="md:col-span-7">
                <p class="text-body font-medium text-text-primary">
                  {{ li.description }}
                  <span
                    v-if="li.optional"
                    class="ml-2 inline-flex items-center rounded-pill bg-surface-muted text-text-secondary px-1.5 py-0.5 text-tiny"
                    data-testid="preview-line-optional"
                  >Optional</span>
                  <span
                    v-if="(li.discountBps ?? 0) > 0"
                    class="ml-2 inline-flex items-center rounded-pill bg-status-info/10 text-status-info px-1.5 py-0.5 text-tiny"
                    data-testid="preview-line-discount"
                  >−{{ ((li.discountBps ?? 0) / 100).toFixed(li.discountBps && li.discountBps % 100 ? 2 : 0) }}%</span>
                </p>
                <p class="text-tiny uppercase tracking-wide text-text-secondary mt-0.5">
                  {{ li.kind }}<span v-if="li.categorySlug"> · {{ li.categorySlug }}</span>
                </p>
                <p
                  v-if="li.notes"
                  class="mt-1 text-small text-text-secondary whitespace-pre-line"
                  data-testid="preview-line-notes"
                >
                  {{ li.notes }}
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

      <!-- Customer-visible notes ----------------------------------- -->
      <section
        v-if="bundle.quote.customerVisibleNotes"
        class="mt-4"
        data-testid="preview-customer-notes"
      >
        <h2 class="text-h2 mb-2">Customer-visible notes</h2>
        <BulwarkCard padding="md">
          <p class="text-body whitespace-pre-line">{{ bundle.quote.customerVisibleNotes }}</p>
        </BulwarkCard>
      </section>

      <!-- Rejection details ---------------------------------------- -->
      <section
        v-if="bundle.quote.status === 'rejected' && (bundle.quote.rejectedReason || bundle.quote.rejectedReasonCode)"
        class="mt-4"
        data-testid="preview-rejection"
      >
        <h2 class="text-h2 mb-2">Rejection</h2>
        <BulwarkCard padding="md">
          <p v-if="bundle.quote.rejectedReasonCode" class="text-small text-text-secondary">
            Reason: {{ tLabel('quote.reject-reasons', bundle.quote.rejectedReasonCode, bundle.quote.rejectedReasonCode) }}
          </p>
          <p v-if="bundle.quote.rejectedReason" class="text-body mt-1 whitespace-pre-line">
            {{ bundle.quote.rejectedReason }}
          </p>
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

        <!-- Revise — always available for sent/rejected/expired -->
        <BulwarkButton
          v-if="['sent', 'rejected', 'expired'].includes(bundle.quote.status)"
          type="button"
          variant="secondary"
          :disabled="revising"
          data-testid="revise-button"
          @click="onRevise"
        >
          {{ revising ? 'Revising…' : 'Revise' }}
        </BulwarkButton>

        <!-- Reject — only from sent -->
        <BulwarkButton
          v-if="bundle.quote.status === 'sent'"
          type="button"
          variant="secondary"
          data-testid="reject-button"
          @click="openReject"
        >
          Reject
        </BulwarkButton>

        <!-- Expire now — sent + past expiryDate -->
        <BulwarkButton
          v-if="bundle.quote.status === 'sent' && bundle.quote.expiryDate && new Date(bundle.quote.expiryDate).getTime() < Date.now()"
          type="button"
          variant="secondary"
          :disabled="expiring"
          data-testid="expire-now-button"
          @click="onExpireNow"
        >
          {{ expiring ? 'Expiring…' : 'Expire now' }}
        </BulwarkButton>

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
        <BulwarkButton
          v-else-if="bundle.quote.status === 'sent'"
          type="button"
          variant="primary"
          :disabled="accepting"
          data-testid="accept-button"
          @click="onAccept"
        >
          {{ accepting ? 'Accepting…' : 'Mark accepted' }}
        </BulwarkButton>
        <NuxtLink
          v-else-if="bundle.quote.status === 'accepted'"
          :to="`/admin/properties/${propertyId}/work-orders/new?quoteId=${bundle.quote.id}`"
          class="inline-flex items-center justify-center rounded-input bg-primary-700 hover:bg-primary text-white px-4 py-2 text-body font-medium"
          data-testid="create-work-order-cta"
        >
          Create work order
        </NuxtLink>
        <p
          v-else
          class="text-body text-text-secondary"
          data-testid="already-sent-note"
        >
          Quote {{ statusCopy(bundle.quote.status).toLowerCase() }}.
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

    <!-- Reject modal --------------------------------------------- -->
    <BulwarkModal v-model="rejectOpen" title="Reject quote" size="md">
      <div data-testid="reject-modal" class="flex flex-col gap-3">
        <BulwarkSelect
          v-model="rejectCode"
          label="Reason"
          :options="REASON_CODES.map((c) => ({ value: c, label: tLabel('quote.reject-reasons', c, c) }))"
          data-testid="reject-reason-code"
        />
        <BulwarkTextarea
          v-model="rejectReason"
          label="Notes (optional)"
          :rows="3"
          data-testid="reject-reason-text"
        />
      </div>
      <template #footer>
        <BulwarkButton
          type="button"
          variant="secondary"
          :disabled="rejecting"
          data-testid="reject-cancel-button"
          @click="rejectOpen = false"
        >
          Cancel
        </BulwarkButton>
        <BulwarkButton
          type="button"
          variant="primary"
          :disabled="rejecting"
          data-testid="reject-submit-button"
          @click="submitReject"
        >
          {{ rejecting ? 'Rejecting…' : 'Reject quote' }}
        </BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
