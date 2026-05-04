<!--
  StatusBadge.vue — the canonical pill renderer.

  Per UI-CONTRACTS.md §display: this is the ONLY component allowed to render
  a colored status pill. Ad-hoc colored chips elsewhere are forbidden because
  status colors must stay aligned to STYLE_GUIDE §2.4 across the whole app.
-->
<script setup lang="ts">
import type { PropertyStatus } from '~~/shared/contracts/property'
import { PROPERTY_STATUS_LABEL } from '~~/shared/contracts/property'

const props = withDefaults(defineProps<{
  status: PropertyStatus
  size?: 'sm' | 'md'
}>(), { size: 'md' })

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
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-pill font-medium whitespace-nowrap',
      toneByStatus[status],
      sizeClass,
    ]"
    :data-status="status"
  >
    {{ PROPERTY_STATUS_LABEL[status] }}
  </span>
</template>
