<!--
  StatusBadge.vue — the canonical pill renderer.

  Per UI-CONTRACTS.md §display: this is the ONLY component allowed to render
  a colored status pill. Ad-hoc colored chips elsewhere are forbidden because
  status colors must stay aligned to STYLE_GUIDE §2.4 across the whole app.

  # EH-B / W1-2 pilot (ADR-0014)
    - The badge resolves its display text via `useLabel().t('status.property',
      status, default)` so an admin override on /settings/labels reaches every
      property surface that renders this pill. This is one of the two
      pilot surfaces for the CMS label registry — the other is the WO trade
      chip on `/admin/work-orders/[id]`.
    - The label resolver falls back to the in-file `PROPERTY_STATUS_LABEL`
      map when no override exists. That fallback is still the source of
      truth for the default copy; `DEFAULT_LABELS` in `shared/labels/defaults`
      re-exports the same strings so they stay in lockstep.
-->
<script setup lang="ts">
import type { PropertyStatus } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'

const props = withDefaults(defineProps<{
  status: PropertyStatus
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const { t: tLabel } = useLabel()

// Tone groupings per STYLE_GUIDE §2.4 — a status maps to a color family.
const toneByStatus: Record<PropertyStatus, string> = {
  lead:                'bg-info-light text-info',
  scheduled:           'bg-info-light text-info',
  assessed:            'bg-purple-light text-purple',
  quoted:              'bg-warning-light text-warning',
  accepted:            'bg-success-light text-success-dark',
  in_progress:         'bg-primary-light text-primary',
  completed:           'bg-success-light text-success-dark',
  compliance_pending:  'bg-warning-light text-warning',
  compliance_complete: 'bg-success-light text-success-dark',
  invoiced:            'bg-purple-light text-purple',
  paid:                'bg-success-light text-success-dark',
  on_hold:             'bg-blocked-light text-blocked',
  cancelled:           'bg-error-light text-error',
}

const sizeClass = computed(() => props.size === 'sm' ? 'text-tiny px-2 py-0.5' : 'text-small px-2.5 py-1')

const displayText = computed(() =>
  tLabel('status.property', props.status, PROPERTY_STATUS_LABEL[props.status]),
)
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-pill font-medium whitespace-nowrap',
      toneByStatus[status],
      sizeClass,
    ]"
    :data-status="status"
    data-testid="status-badge"
  >
    {{ displayText }}
  </span>
</template>
