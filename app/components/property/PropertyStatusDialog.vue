<!--
  PropertyStatusDialog.vue — the AD-13 status-change modal (WP-B2).

  Opened for transitions that need more than a click: the target requires a
  reason (ED-033), it is On hold (reason + note + expected resume date) or
  Cancelled (destructive alertdialog: reason + required note, and the count
  of open invoices, which are left untouched — ED-033). Bulk changes from
  AD-10 reuse it once for the selection (`count` > 1 goes in the heading).

  Reason codes are a built-in list until the pipeline editor (WP-C2) makes
  them tenant-configurable; "Other" requires the note. The notify-client
  toggle (MSG-11) waits on production email (Resend is pinned).
  Emits confirm({ reason, note, resumeOn }) and close; the parent saves and
  passes `saving` / `error` back so a failure keeps the form.
-->
<script setup lang="ts">
import type { StatusPipelineNode } from '~~/shared/contracts/status-pipeline'

export interface StatusChangeDetails { reason?: string, note?: string, resumeOn?: string }

interface Props {
  open: boolean
  target: StatusPipelineNode | null
  targetLabel: string
  fromLabel?: string
  /** Number of properties changing (bulk); 1 for a single property. */
  count?: number
  /** Open invoices on the property (cancel modal only). */
  openInvoiceCount?: number | null
  saving?: boolean
  error?: string
}
const props = withDefaults(defineProps<Props>(), { fromLabel: '', count: 1, openInvoiceCount: null, saving: false, error: '' })
const emit = defineEmits<{ confirm: [details: StatusChangeDetails], close: [] }>()

const HOLD_REASONS = ['Awaiting funding', 'Client request', 'Permit pending', 'Weather', 'Materials delay', 'Other']
const CANCEL_REASONS = ['Client declined', 'Lost to competitor', 'Not eligible', 'Duplicate', 'Unable to reach client', 'Other']

const kind = computed<'hold' | 'cancel' | 'reason'>(() =>
  props.target?.slug === 'on_hold' ? 'hold' : props.target?.slug === 'cancelled' ? 'cancel' : 'reason')
const reasons = computed(() => (kind.value === 'cancel' ? CANCEL_REASONS : HOLD_REASONS).map((r) => ({ value: r, label: r })))

const reason = ref<string | null>(null)
const freeReason = ref('')
const note = ref('')
const resumeOn = ref<string | null>(null)
const errors = reactive({ reason: '', note: '' })

watch(() => props.open, (open) => {
  if (!open) return
  reason.value = null
  freeReason.value = ''
  note.value = ''
  resumeOn.value = null
  errors.reason = ''
  errors.note = ''
})

const plural = computed(() => (props.count > 1 ? `${props.count} properties` : 'this property'))
const title = computed(() => {
  const n = props.count > 1 ? ` (${props.count})` : ''
  if (kind.value === 'hold') return `Put on hold${n}`
  if (kind.value === 'cancel') return `Cancel ${props.count > 1 ? `${props.count} properties` : 'property'}`
  return `Move to ${props.targetLabel}${n}`
})

function submit() {
  errors.reason = ''
  errors.note = ''
  const coded = kind.value !== 'reason'
  const chosen = coded ? reason.value ?? '' : freeReason.value.trim()
  if (!chosen && (coded || props.target?.requiresReason)) errors.reason = coded ? 'Choose a reason.' : 'Give a reason for this change.'
  const needsNote = kind.value === 'cancel' || reason.value === 'Other'
  if (needsNote && note.value.trim().length < 3) errors.note = 'Add a note of at least 3 characters.'
  if (errors.reason || errors.note) return
  emit('confirm', {
    reason: chosen || undefined,
    note: note.value.trim() || undefined,
    resumeOn: kind.value === 'hold' && resumeOn.value ? resumeOn.value : undefined,
  })
}
</script>

<template>
  <BulwarkModal
    :open="open"
    :title="title"
    size="md"
    :destructive="kind === 'cancel'"
    :close-on-overlay="kind !== 'cancel'"
    data-testid="property-status-dialog"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <BulwarkBanner v-if="error" tone="danger" data-testid="status-dialog-error">{{ error }}</BulwarkBanner>
      <p v-if="kind === 'hold'">
        Work on {{ plural }} pauses until it is moved back. Scheduled jobs stay on the calendar until you reschedule them.
      </p>
      <p v-else-if="kind === 'cancel'">
        Cancelling stops work on {{ plural }}.
        <template v-if="openInvoiceCount">
          <strong data-testid="status-dialog-open-invoices">{{ openInvoiceCount }} open {{ openInvoiceCount === 1 ? 'invoice stays' : 'invoices stay' }}</strong>
          as {{ openInvoiceCount === 1 ? 'it is' : 'they are' }}: void or collect from the invoice.
        </template>
        <template v-else>Invoices are not changed.</template>
      </p>
      <p v-else-if="fromLabel">Moves {{ plural }} from {{ fromLabel }} to {{ targetLabel }}.</p>

      <BulwarkSelect
        v-if="kind !== 'reason'"
        v-model="reason"
        label="Reason"
        :options="reasons"
        placeholder="Choose a reason"
        required
        :error="errors.reason"
        data-testid="status-dialog-reason"
      />
      <BulwarkTextarea
        v-else
        v-model="freeReason"
        label="Reason"
        :required="!!target?.requiresReason"
        :rows="2"
        :error="errors.reason"
        data-testid="status-dialog-reason"
      />
      <BulwarkTextarea
        v-if="kind !== 'reason'"
        v-model="note"
        label="Note"
        :required="kind === 'cancel' || reason === 'Other'"
        :rows="3"
        :error="errors.note"
        data-testid="status-dialog-note"
      />
      <BulwarkDatePicker
        v-if="kind === 'hold'"
        v-model="resumeOn"
        label="Expected resume date (optional)"
        data-testid="status-dialog-resume"
      />
    </div>
    <template #footer>
      <BulwarkButton variant="secondary" data-testid="status-dialog-cancel" @click="emit('close')">
        {{ kind === 'cancel' ? 'Keep property' : 'Cancel' }}
      </BulwarkButton>
      <BulwarkButton
        :variant="kind === 'cancel' ? 'destructive' : 'primary'"
        :loading="saving"
        data-testid="status-dialog-confirm"
        @click="submit"
      >
        {{ kind === 'hold' ? 'Put on hold' : kind === 'cancel' ? 'Cancel property' : 'Change status' }}
      </BulwarkButton>
    </template>
  </BulwarkModal>
</template>
