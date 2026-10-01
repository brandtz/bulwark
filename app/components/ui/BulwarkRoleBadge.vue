<!--
  BulwarkRoleBadge.vue — a person's role (Packet A components/SPEC.md, WP-A3).
  The label comes from the tenant's label set (useLabel role.<id>) unless
  passed. Staff roles are neutral; portal roles (client, sub, stakeholder) get
  a hue so mixed lists read at a glance — text always carries the meaning.
-->
<script setup lang="ts">
import type { StatusHue } from '~~/shared/utils/status-hue'

const props = withDefaults(defineProps<{
  role: string
  label?: string
}>(), { label: undefined })
const { t } = useLabel()
const DEFAULT_LABEL: Record<string, string> = {
  super_admin: 'Owner', org_admin: 'Admin', org_manager: 'Manager', field: 'Field', viewer: 'Viewer',
  sub_contractor: 'Subcontractor', homeowner: 'Client', stakeholder: 'Stakeholder',
}
const HUE: Record<string, StatusHue> = { sub_contractor: 'violet', homeowner: 'teal', stakeholder: 'amber' }
const text = computed(() => props.label ?? t('role', props.role, DEFAULT_LABEL[props.role] ?? props.role))
</script>

<template>
  <StatusBadge :hue="HUE[role] ?? 'slate'" :label="text" size="sm" variant="outline" :data-role="role" />
</template>
