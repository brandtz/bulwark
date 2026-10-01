<!--
  BulwarkJobCard.vue — one job in a day list or board (Packet A components/SPEC.md, WP-A2).

  An <article> whose heading is the address; the status text comes first in
  reading order. The left rail takes the status hue (the only coloured border
  in the system). A blocked reason is spelled out inline, never colour only.
  The CTA is a real button (touch-sized via density); clicking the card
  elsewhere emits `open`.

  `job` is the card's view model, not a contract type: screens map their work
  order / slot into it. `status` is { id, label, hue } (hue per WP-X5).
-->
<script setup lang="ts">
import type { StatusHue } from './StatusBadge.vue'

export interface JobCardJob {
  number?: string
  address: string
  window?: string
  trade?: string
  scope?: string
  assignee?: { name: string, avatarUrl?: string | null } | null
  blockedReason?: string | null
}

interface Props {
  job: JobCardJob
  status: { id: string, label: string, hue: StatusHue }
  showAssignee?: boolean
  cta?: { label: string, action?: () => void } | null
  density?: 'comfortable' | 'compact' | 'touch'
}
const props = withDefaults(defineProps<Props>(), { showAssignee: true, cta: null, density: undefined })
const emit = defineEmits<{ open: [], cta: [] }>()

const headingId = useId()

function onCta() {
  props.cta?.action?.()
  emit('cta')
}
</script>

<template>
  <article
    class="bw-card bw-card--sm bw-card--clickable bw-rail flex flex-col gap-2.5"
    :data-hue="status.hue"
    :data-density="density"
    :aria-labelledby="headingId"
    @click="emit('open')"
  >
    <div class="flex items-center gap-2">
      <StatusBadge :hue="status.hue" :label="status.label" size="sm" />
      <span v-if="job.number" class="bw-help mono">{{ job.number }}</span>
    </div>
    <h3 :id="headingId" class="truncate" style="margin: 0; font: 600 var(--text-lg) var(--font-display); color: var(--text-primary)">
      {{ job.address }}
    </h3>
    <p v-if="job.window || job.trade || job.scope" class="bw-help flex flex-wrap gap-x-3 gap-y-1" style="font-size: var(--text-sm)">
      <span v-if="job.window" class="inline-flex items-center gap-1 tnum"><BulwarkIcon name="clock" size="sm" />{{ job.window }}</span>
      <span v-if="job.trade" class="inline-flex items-center gap-1"><BulwarkIcon name="wrench" size="sm" />{{ job.trade }}</span>
      <span v-if="job.scope" class="truncate">{{ job.scope }}</span>
    </p>
    <p v-if="job.blockedReason" class="bw-error" role="note">
      <BulwarkIcon name="alert-triangle" size="sm" />Blocked: {{ job.blockedReason }}
    </p>
    <div v-if="(showAssignee && job.assignee) || cta" class="flex items-center gap-2 mt-1">
      <template v-if="showAssignee && job.assignee">
        <BulwarkAvatar :name="job.assignee.name" :src="job.assignee.avatarUrl" size="sm" />
        <span style="font-size: var(--text-sm); color: var(--text-secondary)">{{ job.assignee.name }}</span>
      </template>
      <button v-if="cta" type="button" class="bw-btn bw-btn--primary bw-btn--sm ml-auto" @click.stop="onCta">
        {{ cta.label }}
      </button>
    </div>
  </article>
</template>
