<!--
  BulwarkDatePicker.vue — date, range, date-time or time
  (Packet A components/SPEC.md, WP-A2).

  Native inputs (type=date / datetime-local / time; a range is two dates) with
  the field anatomy of BulwarkInput. `min` / `max` accept a Date or an ISO
  string. `disabledDates` refuses a picked day with an inline error. The
  chosen date is echoed with its weekday ("Tue, Oct 7, 2026") because job dates
  are read by weekday (SPEC).
  ED-064: the SPEC's custom calendar grid (arrow keys, PgUp/PgDn) arrives with
  the scheduling screens that need it; native inputs are accessible meanwhile
  and are what the SPEC prescribes under 768px anyway.
  A range binds `v-model:start` / `v-model:end`; the other modes use v-model
  with an ISO string.
-->
<script setup lang="ts">
interface Props {
  modelValue?: string | null
  /** Range mode: start date (v-model:start). */
  start?: string | null
  /** Range mode: end date (v-model:end). */
  end?: string | null
  label: string
  mode?: 'date' | 'range' | 'datetime' | 'time'
  min?: string | Date
  max?: string | Date
  disabledDates?: (d: Date) => boolean
  /** Show the weekday echo under the field (date modes). */
  format?: string
  error?: string
  required?: boolean
  disabled?: boolean
  helper?: string
  /** @deprecated use `helper`. */
  hint?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  start: null,
  end: null,
  mode: 'date',
  min: undefined,
  max: undefined,
  disabledDates: undefined,
  format: 'EEE, MMM d, yyyy',
  error: '',
  required: false,
  disabled: false,
  helper: '',
  hint: '',
  id: undefined,
})
const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:start': [v: string | null]
  'update:end': [v: string | null]
}>()

const reactiveId = useId()
const inputId = computed(() => props.id ?? `dt-${reactiveId}`)
const helperText = computed(() => props.helper || props.hint)
const localError = ref('')
const shownError = computed(() => props.error || localError.value)

const nativeType = computed(() => (props.mode === 'datetime' ? 'datetime-local' : props.mode === 'time' ? 'time' : 'date'))
function iso(v: string | Date | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  const d = v.toISOString()
  return props.mode === 'datetime' ? d.slice(0, 16) : props.mode === 'time' ? d.slice(11, 16) : d.slice(0, 10)
}
const range = computed(() => ({ start: props.start, end: props.end }))
const single = computed(() => props.modelValue ?? '')

function weekday(value: string | null | undefined): string {
  if (!value || props.mode === 'time') return ''
  const d = new Date(props.mode === 'datetime' ? value : `${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  if (props.mode === 'datetime') Object.assign(opts, { hour: 'numeric', minute: '2-digit' })
  return new Intl.DateTimeFormat('en-US', opts).format(d)
}

function refused(value: string): boolean {
  if (!props.disabledDates || !value || props.mode === 'time') return false
  return props.disabledDates(new Date(props.mode === 'datetime' ? value : `${value}T12:00:00`))
}

function onSingle(e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (refused(value)) { localError.value = 'That date is not available.'; return }
  localError.value = ''
  emit('update:modelValue', value)
}

function onRange(part: 'start' | 'end', e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (refused(value)) { localError.value = 'That date is not available.'; return }
  const next = { ...range.value, [part]: value || null }
  localError.value = next.start && next.end && next.end < next.start ? 'The end date is before the start date.' : ''
  if (part === 'start') emit('update:start', next.start)
  else emit('update:end', next.end)
}

const describedBy = computed(() => (shownError.value ? `${inputId.value}-err` : helperText.value ? `${inputId.value}-hint` : undefined))
</script>

<template>
  <div class="bw-field">
    <label :for="inputId" class="bw-label">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>

    <div v-if="mode === 'range'" class="flex items-center gap-2">
      <input
        :id="inputId"
        type="date"
        :value="range.start ?? ''"
        :min="iso(min)"
        :max="range.end ?? iso(max)"
        :required="required"
        :disabled="disabled"
        :aria-invalid="!!shownError"
        :aria-describedby="describedBy"
        aria-label="Start date"
        class="bw-input tnum"
        :class="{ 'is-error': !!shownError }"
        @change="onRange('start', $event)"
      >
      <span class="bw-help" aria-hidden="true">to</span>
      <input
        type="date"
        :value="range.end ?? ''"
        :min="range.start ?? iso(min)"
        :max="iso(max)"
        :required="required"
        :disabled="disabled"
        :aria-invalid="!!shownError"
        :aria-describedby="describedBy"
        aria-label="End date"
        class="bw-input tnum"
        :class="{ 'is-error': !!shownError }"
        @change="onRange('end', $event)"
      >
    </div>
    <input
      v-else
      :id="inputId"
      :type="nativeType"
      :value="single"
      :min="iso(min)"
      :max="iso(max)"
      :required="required"
      :disabled="disabled"
      :aria-invalid="!!shownError"
      :aria-describedby="describedBy"
      class="bw-input tnum"
      :class="{ 'is-error': !!shownError }"
      @change="onSingle"
    >

    <p v-if="shownError" :id="`${inputId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ shownError }}
    </p>
    <p v-else-if="helperText" :id="`${inputId}-hint`" class="bw-help">{{ helperText }}</p>
    <p v-if="format && mode !== 'range' && weekday(single)" class="bw-help" aria-hidden="true">{{ weekday(single) }}</p>
    <p v-else-if="format && mode === 'range' && range.start && range.end" class="bw-help" aria-hidden="true">
      {{ weekday(range.start) }} – {{ weekday(range.end) }}
    </p>
  </div>
</template>
