<!--
  BulwarkStatusMenu.vue — change a record's status (Packet A PropertyStatusMenu
  SPEC, generalised; WP-A3). Replaces PropertyStatusMenu as screens adopt it.

  The trigger is the current status badge (node hue, WP-X5). The menu lists
  every status: pipeline-legal transitions are enabled, the others disabled
  with the reason ("Not allowed from Quoted"). Choosing a status that
  `requiresReason` (ED-033) or that moves backwards in the pipeline opens a
  BulwarkModal: a reason field when required, a confirmation for backwards
  moves. Emits `change` with the slug and the reason.
-->
<script setup lang="ts">
import type { StatusPipelineNode } from '~~/shared/contracts/status-pipeline'
import type { MenuEntry } from './BulwarkMenu.vue'

interface Props {
  current: string
  statuses: StatusPipelineNode[]
  /** Label namespace for useLabel (status.<entityType>.<slug>). */
  entityType?: string
  disabled?: boolean
}
const props = withDefaults(defineProps<Props>(), { entityType: 'property', disabled: false })
const emit = defineEmits<{ change: [slug: string, reason?: string] }>()

const { t: tLabel } = useLabel()
const labelFor = (slug: string) => tLabel(`status.${props.entityType}`, slug, slug.replaceAll('_', ' ').replace(/^./u, (c) => c.toUpperCase()))

const currentNode = computed(() => props.statuses.find((n) => n.slug === props.current))
const sorted = computed(() => [...props.statuses].sort((a, b) => a.sortOrder - b.sortOrder))
const items = computed<MenuEntry[]>(() => sorted.value
  .filter((n) => n.slug !== props.current)
  .map((n) => {
    const legal = currentNode.value?.allowedTransitions.includes(n.slug) ?? false
    return {
      label: labelFor(n.slug),
      value: n.slug,
      disabled: !legal,
      reason: legal ? undefined : `Not allowed from ${labelFor(props.current)}`,
    }
  }))

// ---- confirmation / reason dialog ----------------------------------------
const pending = ref<StatusPipelineNode | null>(null)
const reason = ref('')
const reasonError = ref('')
const backwards = computed(() => !!pending.value && !!currentNode.value && pending.value.sortOrder < currentNode.value.sortOrder)

function onSelect(it: MenuEntry) {
  const node = props.statuses.find((n) => n.slug === it.value)
  if (!node) return
  if (node.requiresReason || (currentNode.value && node.sortOrder < currentNode.value.sortOrder)) {
    pending.value = node
    reason.value = ''
    reasonError.value = ''
    return
  }
  emit('change', node.slug)
}

function confirm() {
  if (!pending.value) return
  if (pending.value.requiresReason && !reason.value.trim()) {
    reasonError.value = 'Give a reason for this change.'
    return
  }
  emit('change', pending.value.slug, reason.value.trim() || undefined)
  pending.value = null
}
</script>

<template>
  <div class="inline-block" @click.stop>
    <BulwarkMenu :items="items" :label="`Change status from ${labelFor(current)}`" @select="onSelect">
      <template #trigger="{ toggle, attrs }">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full"
          :disabled="disabled"
          :aria-label="`Status: ${labelFor(current)}. Change status`"
          data-testid="status-menu-button"
          v-bind="attrs"
          @click="toggle"
        >
          <StatusBadge :hue="currentNode?.hue ?? 'gray'" :label="labelFor(current)" />
          <BulwarkIcon v-if="!disabled" name="chevron-down" size="sm" />
        </button>
      </template>
    </BulwarkMenu>

    <BulwarkModal
      :open="!!pending"
      :title="pending ? `Change status to ${labelFor(pending.slug)}?` : ''"
      size="sm"
      @close="pending = null"
    >
      <p v-if="backwards">This moves the record back from {{ labelFor(current) }} to {{ pending && labelFor(pending.slug) }}.</p>
      <BulwarkTextarea
        v-if="pending?.requiresReason"
        v-model="reason"
        label="Reason"
        required
        :rows="3"
        :error="reasonError"
        data-testid="status-reason"
      />
      <template #footer>
        <BulwarkButton variant="secondary" @click="pending = null">Cancel</BulwarkButton>
        <BulwarkButton data-testid="status-confirm" @click="confirm">Change status</BulwarkButton>
      </template>
    </BulwarkModal>
  </div>
</template>
