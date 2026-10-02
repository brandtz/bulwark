<!--
  PropertyStatusControl.vue — AD-13 status menu on the property hub (WP-B2).

  The trigger is the current status badge. The menu: "Move to" with every
  other pipeline status (legal targets enabled, the rest disabled with
  "Not allowed from X"), then Put on hold… / Cancel property… when the
  pipeline allows them, then Status history. Simple moves commit at once
  with a toast; Undo is offered only when the pipeline allows the reverse
  move (a 5s delayed commit would be lost on navigation). Hold, cancel and
  reason-required targets open PropertyStatusDialog first.
  Emits `changed` after a successful save so the hub refetches.
-->
<script setup lang="ts">
import type { MenuEntry } from '~/components/ui/BulwarkMenu.vue'
import type { StatusChangeDetails } from './PropertyStatusDialog.vue'
import { PROPERTY_STATUS_LABEL, type Property, type PropertyStatus } from '~~/shared/contracts/property'
import type { StatusPipelineNode } from '~~/shared/contracts/status-pipeline'
import type { AuditLogRow } from '~~/shared/contracts/audit'

interface Props {
  property: Property
  statuses: StatusPipelineNode[]
  openInvoiceCount?: number
  /** state_change audit rows for the history modal. */
  history?: AuditLogRow[]
  actorName?: (id: string | null) => string
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), { openInvoiceCount: 0, history: () => [], actorName: () => 'System', disabled: false })
const emit = defineEmits<{ changed: [] }>()

const propertySvc = useService('property')
const toast = useToast()
const { t: tLabel } = useLabel()
const label = (slug: string) => tLabel('status.property', slug, PROPERTY_STATUS_LABEL[slug as PropertyStatus] ?? slug.replaceAll('_', ' ').replace(/^./u, (c) => c.toUpperCase()))

const nodeBy = computed(() => new Map(props.statuses.map((n) => [n.slug, n])))
const current = computed(() => nodeBy.value.get(props.property.status))
const legal = (to: string) => current.value?.allowedTransitions.includes(to) ?? false
const SPECIAL = new Set(['on_hold', 'cancelled'])

const items = computed<MenuEntry[]>(() => {
  const moves = [...props.statuses]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((n) => n.slug !== props.property.status && !SPECIAL.has(n.slug))
    .map((n): MenuEntry => ({ label: label(n.slug), value: n.slug, disabled: !legal(n.slug), reason: legal(n.slug) ? undefined : `Not allowed from ${label(props.property.status)}` }))
  const out: MenuEntry[] = [{ label: 'Move to', heading: true }, ...moves]
  const hold = nodeBy.value.get('on_hold')
  const cancel = nodeBy.value.get('cancelled')
  if ((hold && props.property.status !== 'on_hold') || (cancel && props.property.status !== 'cancelled')) out.push({ label: '', separator: true })
  if (hold && props.property.status !== 'on_hold') out.push({ label: 'Put on hold…', value: 'on_hold', icon: 'clock', disabled: !legal('on_hold'), reason: legal('on_hold') ? undefined : `Not allowed from ${label(props.property.status)}` })
  if (cancel && props.property.status !== 'cancelled') out.push({ label: 'Cancel property…', value: 'cancelled', icon: 'x-circle', destructive: true, disabled: !legal('cancelled'), reason: legal('cancelled') ? undefined : `Not allowed from ${label(props.property.status)}` })
  out.push({ label: '', separator: true }, { label: 'Status history', value: '__history', icon: 'list' })
  return out
})

const dialog = reactive({ open: false, target: null as StatusPipelineNode | null, saving: false, error: '' })
const historyOpen = ref(false)
const trigger = ref<HTMLElement | null>(null)

function onSelect(it: MenuEntry) {
  if (it.value === '__history') {
    historyOpen.value = true
    return
  }
  const node = it.value ? nodeBy.value.get(it.value) : undefined
  if (!node) return
  if (node.requiresReason || SPECIAL.has(node.slug)) {
    Object.assign(dialog, { open: true, target: node, saving: false, error: '' })
    return
  }
  void move(node.slug)
}

async function move(to: string, details: StatusChangeDetails = {}): Promise<boolean> {
  const from = props.property.status
  try {
    await propertySvc.updateStatus(props.property.id, to, props.property.organizationId, details.reason, { note: details.note, resumeOn: details.resumeOn })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).replace(/^.*?: /u, '')
    if (dialog.open) dialog.error = msg
    else toast.push({ title: `Couldn't move to ${label(to)}`, body: msg, tone: 'error' })
    return false
  }
  const back = nodeBy.value.get(to)?.allowedTransitions.includes(from) && !nodeBy.value.get(from)?.requiresReason
  toast.push({
    title: `Moved to ${label(to)}`,
    tone: 'success',
    duration: 5000,
    action: back ? { label: 'Undo', onClick: () => void move(from).then(() => emit('changed')) } : undefined,
  })
  emit('changed')
  return true
}

async function confirm(details: StatusChangeDetails) {
  if (!dialog.target) return
  dialog.saving = true
  dialog.error = ''
  const ok = await move(dialog.target.slug, details)
  dialog.saving = false
  if (ok) dialog.open = false
}
function closeDialog() {
  dialog.open = false
  nextTick(() => trigger.value?.focus())
}

const historyRows = computed(() => props.history
  .filter((r) => r.action === 'state_change')
  .map((r) => ({
    id: r.id,
    when: new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    change: `${label(String(r.metadata.from ?? '—'))} → ${label(String(r.metadata.to ?? '—'))}`,
    reason: [r.metadata.reason, r.metadata.note].filter(Boolean).join(' — ') || '—',
    actor: props.actorName(r.actorUserId),
  })))
</script>

<template>
  <div class="inline-block">
    <BulwarkMenu :items="items" :label="`Change status from ${label(property.status)}`" :width="300" @select="onSelect">
      <template #trigger="{ toggle, attrs }">
        <button
          ref="trigger"
          type="button"
          class="inline-flex items-center gap-1 rounded-full min-h-10"
          :disabled="disabled"
          :aria-label="`Status: ${label(property.status)}. Change status`"
          data-testid="status-menu-button"
          v-bind="attrs"
          @click="toggle"
        >
          <StatusBadge :hue="current?.hue ?? 'gray'" :label="label(property.status)" />
          <BulwarkIcon v-if="!disabled" name="chevron-down" size="sm" />
        </button>
      </template>
    </BulwarkMenu>

    <PropertyStatusDialog
      :open="dialog.open"
      :target="dialog.target"
      :target-label="dialog.target ? label(dialog.target.slug) : ''"
      :from-label="label(property.status)"
      :open-invoice-count="openInvoiceCount"
      :saving="dialog.saving"
      :error="dialog.error"
      @confirm="confirm"
      @close="closeDialog"
    />

    <BulwarkModal :open="historyOpen" title="Status history" size="lg" @close="historyOpen = false">
      <BulwarkDataTable
        :columns="[{ key: 'when', label: 'When' }, { key: 'change', label: 'Change' }, { key: 'reason', label: 'Reason' }, { key: 'actor', label: 'By' }]"
        :rows="historyRows"
        caption="Status history"
        empty-title="No status changes yet"
        data-testid="status-history"
      />
    </BulwarkModal>
  </div>
</template>
