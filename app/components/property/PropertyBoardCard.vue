<!--
  PropertyBoardCard.vue — AD-10 card body (WP-B2), rendered inside the board's
  link card (and the phone list). Three lines: address, note line (hold /
  cancel reason, else "Updated MMM d"), then assignee avatar · value · city.
  Keeps the legacy `property-card` test id + data-property-id hooks.
-->
<script setup lang="ts">
interface Props {
  row: { id: string, addressLine1: string, city: string, note: string, assigneeName: string, value: number }
  money: (cents: number) => string
}
defineProps<Props>()
</script>

<template>
  <div class="flex flex-col gap-1 min-w-0" data-testid="property-card" :data-property-id="row.id">
    <p class="font-semibold truncate" data-testid="property-address">{{ row.addressLine1 }}</p>
    <p class="bw-help truncate">{{ row.note }}</p>
    <div class="flex items-center gap-2 bw-help">
      <BulwarkAvatar v-if="row.assigneeName" :name="row.assigneeName" size="sm" :title="row.assigneeName" />
      <span class="tnum" :class="row.value ? 'text-[color:var(--text-primary)]' : ''">{{ money(row.value) }}</span>
      <span class="ml-auto truncate">{{ row.city }}</span>
    </div>
  </div>
</template>
