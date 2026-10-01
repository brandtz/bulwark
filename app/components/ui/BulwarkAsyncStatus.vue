<!--
  BulwarkAsyncStatus.vue — state of a background task (Packet A components/SPEC.md, WP-A3).

  Kinds: document (generating PDFs), payment, sync, save. States:
  pending/working (polite), done (with time), failed (role=alert, Retry).
  `reference` (request id / job id) is shown on failure so support can find
  it. Variant inline (beside the thing) or banner (page level).
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type Kind = 'document' | 'payment' | 'sync' | 'save'
type State = 'idle' | 'pending' | 'working' | 'done' | 'failed' | 'conflict'
interface Props {
  kind: Kind
  state: State
  at?: string | Date | null
  reference?: string
  variant?: 'inline' | 'banner'
}
const props = withDefaults(defineProps<Props>(), { at: null, reference: '', variant: 'inline' })
const emit = defineEmits<{ retry: [], resolve: [], open: [] }>()

const NOUN: Record<Kind, string> = { document: 'Document', payment: 'Payment', sync: 'Sync', save: 'Changes' }
const ICON: Record<State, IconName> = { idle: 'clock', pending: 'clock', working: 'refresh', done: 'check-circle', failed: 'alert-circle', conflict: 'alert-triangle' }
const time = computed(() => {
  if (!props.at) return ''
  const d = props.at instanceof Date ? props.at : new Date(props.at)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d)
})
const text = computed(() => ({
  idle: `${NOUN[props.kind]} not started`,
  pending: `${NOUN[props.kind]} queued`,
  working: props.kind === 'document' ? 'Generating…' : props.kind === 'payment' ? 'Processing payment…' : props.kind === 'save' ? 'Saving…' : 'Syncing…',
  done: props.kind === 'save' ? `Saved${time.value ? ` at ${time.value}` : ''}` : `${NOUN[props.kind]} ready${time.value ? ` · ${time.value}` : ''}`,
  failed: `${NOUN[props.kind]} failed`,
  conflict: 'Conflicting changes',
}[props.state]))
const tone = computed(() => (props.state === 'failed' ? 'var(--danger-fg)' : props.state === 'done' ? 'var(--success-fg)' : props.state === 'conflict' ? 'var(--warning-fg)' : 'var(--text-secondary)'))
</script>

<template>
  <div
    :class="variant === 'banner' ? 'bw-banner' : 'inline-flex items-center gap-2'"
    :style="variant === 'inline' ? { color: tone, fontSize: 'var(--text-sm)' } : undefined"
    :role="state === 'failed' ? 'alert' : 'status'"
    :aria-live="state === 'failed' ? undefined : 'polite'"
    data-testid="async-status"
    :data-state="state"
  >
    <BulwarkIcon :name="ICON[state]" size="sm" />
    <span>{{ text }}</span>
    <span v-if="state === 'failed' && reference" class="bw-help mono">Ref {{ reference }}</span>
    <button v-if="state === 'failed'" type="button" class="bw-btn bw-btn--link bw-btn--sm" @click="emit('retry')">Try again</button>
    <button v-if="state === 'conflict'" type="button" class="bw-btn bw-btn--link bw-btn--sm" @click="emit('resolve')">Resolve</button>
    <button v-if="state === 'done' && kind === 'document'" type="button" class="bw-btn bw-btn--link bw-btn--sm" @click="emit('open')">Open</button>
  </div>
</template>
