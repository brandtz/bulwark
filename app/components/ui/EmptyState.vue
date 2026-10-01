<!--
  EmptyState.vue — empty, no-results, error and forbidden states
  (Packet A components/SPEC.md, WP-A2).

  `flavor` picks the default icon and tone; `title` says what is missing,
  `body` what to do. Actions: SPEC `primary` / `secondary` ({ label, action }
  where action is a route or a function); existing callers' `cta`
  ({ label, to }) still works. The error flavor shows `errorRef` (a request id)
  so support can find the failure.
-->
<script setup lang="ts">
import type { IconName } from './icon-names'

type Action = { label: string; action: string | (() => void) }
interface CTA { label: string; to: string }
interface Props {
  flavor?: 'first-run' | 'no-results' | 'error' | 'forbidden'
  title: string
  body?: string
  icon?: IconName | string
  primary?: Action | null
  secondary?: Action | null
  errorRef?: string
  /** @deprecated use `primary`. */
  cta?: CTA | null
}
const props = withDefaults(defineProps<Props>(), {
  flavor: 'first-run',
  body: '',
  icon: undefined,
  primary: null,
  secondary: null,
  errorRef: undefined,
  cta: null,
})

const FLAVOR_ICON: Record<NonNullable<Props['flavor']>, IconName> = {
  'first-run': 'plus',
  'no-results': 'search',
  error: 'alert-triangle',
  forbidden: 'shield',
}
// Legacy callers passed a glyph character; only icon names render as icons.
const iconName = computed<IconName>(() =>
  props.icon && /^[a-z][a-z-]+$/u.test(props.icon) ? (props.icon as IconName) : FLAVOR_ICON[props.flavor])
const primaryAction = computed<Action | null>(() => props.primary ?? (props.cta ? { label: props.cta.label, action: props.cta.to } : null))
</script>

<template>
  <div class="bw-empty" :role="flavor === 'error' ? 'alert' : undefined">
    <span class="ic" aria-hidden="true">
      <BulwarkIcon :name="iconName" size="lg" />
    </span>
    <h3>{{ title }}</h3>
    <p v-if="body">{{ body }}</p>
    <p v-if="flavor === 'error' && errorRef" class="mono">Reference: {{ errorRef }}</p>
    <div v-if="primaryAction || secondary" class="acts">
      <template v-for="(a, i) in [primaryAction, secondary]" :key="i">
        <template v-if="a">
          <NuxtLink
            v-if="typeof a.action === 'string'"
            :to="a.action"
            class="bw-btn"
            :class="i === 0 ? 'bw-btn--primary' : 'bw-btn--secondary'"
          >{{ a.label }}</NuxtLink>
          <button
            v-else
            type="button"
            class="bw-btn"
            :class="i === 0 ? 'bw-btn--primary' : 'bw-btn--secondary'"
            @click="a.action()"
          >{{ a.label }}</button>
        </template>
      </template>
    </div>
  </div>
</template>
