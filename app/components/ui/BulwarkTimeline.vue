<!--
  BulwarkTimeline.vue — activity feed or milestones (Packet A components/SPEC.md, WP-A3).

  An <ol>; each time is a <time datetime>. Activity items may carry a `diff`
  shown in <details>/<summary> (collapsed by default). Milestones show done /
  current / upcoming with text, not only colour. `pageSize` items render; a
  "Show more" emits load-more. Clicking an item with `to` or `entity` emits open.
-->
<script setup lang="ts">
interface Activity { id: string, actor?: string, action: string, at: string, detail?: string, diff?: Array<{ field: string, from: string | null, to: string | null }> }
interface Milestone { id: string, label: string, at?: string | null, state: 'done' | 'current' | 'upcoming' }
interface Props {
  variant?: 'activity' | 'milestones'
  items: Activity[] | Milestone[]
  pageSize?: number
  hasMore?: boolean
}
const props = withDefaults(defineProps<Props>(), { variant: 'activity', pageSize: 25, hasMore: false })
const emit = defineEmits<{ 'load-more': [], open: [id: string] }>()

const shown = computed(() => props.items.slice(0, props.pageSize))
const when = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
}
const STATE_TEXT = { done: 'Done', current: 'In progress', upcoming: 'Upcoming' } as const
</script>

<template>
  <div>
    <ol class="flex flex-col" :class="variant === 'activity' ? 'gap-3' : 'gap-0'">
      <template v-if="variant === 'activity'">
        <li v-for="a in shown as Activity[]" :key="a.id" class="flex gap-3" data-testid="timeline-item">
          <span class="mt-1.5 rounded-full shrink-0" style="width: 8px; height: 8px; background: var(--accent)" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p style="font-size: var(--text-sm)">
              <strong v-if="a.actor">{{ a.actor }}</strong> {{ a.action }}
            </p>
            <p v-if="a.detail" class="bw-help">{{ a.detail }}</p>
            <details v-if="a.diff?.length" class="mt-1 bw-help">
              <summary class="cursor-pointer">{{ a.diff.length }} field{{ a.diff.length === 1 ? '' : 's' }} changed</summary>
              <ul class="mt-1">
                <li v-for="d in a.diff" :key="d.field"><strong>{{ d.field }}</strong>: {{ d.from ?? '—' }} → {{ d.to ?? '—' }}</li>
              </ul>
            </details>
            <time :datetime="a.at" class="bw-help tnum">{{ when(a.at) }}</time>
          </div>
        </li>
      </template>
      <template v-else>
        <li v-for="(m, i) in shown as Milestone[]" :key="m.id" class="flex gap-3" data-testid="timeline-milestone" :aria-current="m.state === 'current' ? 'step' : undefined">
          <div class="flex flex-col items-center">
            <span
              class="rounded-full grid place-items-center shrink-0"
              style="width: 20px; height: 20px; border: 2px solid var(--border-strong)"
              :style="m.state === 'done' ? 'background: var(--success-fg); border-color: var(--success-fg)' : m.state === 'current' ? 'border-color: var(--accent)' : ''"
              aria-hidden="true"
            />
            <span v-if="i < shown.length - 1" class="flex-1 w-0.5 my-1" style="background: var(--divider); min-height: 16px" aria-hidden="true" />
          </div>
          <div class="pb-3 min-w-0">
            <p style="font-size: var(--text-sm); font-weight: 600">{{ m.label }}</p>
            <p class="bw-help">{{ STATE_TEXT[m.state] }}<template v-if="m.at"> · <time :datetime="m.at">{{ when(m.at) }}</time></template></p>
          </div>
        </li>
      </template>
    </ol>
    <BulwarkButton v-if="hasMore || items.length > pageSize" variant="link" size="sm" class="mt-2" @click="emit('load-more')">Show more</BulwarkButton>
  </div>
</template>
