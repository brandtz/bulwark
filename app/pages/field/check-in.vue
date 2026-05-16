<!--
  app/pages/field/check-in.vue — standalone check-in / out (W3-3 / EH-M /
  ADR-0029).

  # What this is
    For site visits not tied to a scheduled work order — e.g. the
    crew swings by an open property to drop materials. The page lets
    the user pick a property from the field-visible list and records
    a check-in row against that property.

  # Decisions (ADR-0008)
    - We re-use `/api/field/check-in` with `workOrderId` omitted. The
      endpoint already handles that case (anchors the audit row on
      `property` instead of `work_order`).
    - The property selector is a short scrollable list — not a
      typeahead. v1 expects a handful of active properties per crew
      per day; if/when that exceeds ~30 entries we promote to search.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'
import type { Property } from '~~/shared/contracts/property'

definePageMeta({
  layout: 'field',
  middleware: 'field-role',
  fieldTitle: 'Check in',
})

const { t } = useLabel()
const toast = useToast()
const { session, ensureLoaded } = useSession()
await ensureLoaded()
if (!session.value) throw createError({ statusCode: 401 })
const orgId = session.value.activeOrganizationId

const propertyService = useService('property')
const selected = ref<string | null>(null)
const busy = ref(false)

const { data: properties } = await useAsyncData(
  () => `field-check-in-properties-${orgId}`,
  async () => {
    const res = await propertyService.list({
      organizationId: orgId,
      page: 1,
      pageSize: 50,
    })
    return res.rows.filter((p: Property) => p.status !== 'paid' && p.status !== 'cancelled')
  },
)

async function check(kind: 'in' | 'out'): Promise<void> {
  if (!selected.value) return
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    toast.error('Geolocation not supported.')
    return
  }
  busy.value = true
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
      })
    })
    await $fetch('/api/field/check-in', {
      method: 'POST',
      body: {
        propertyId: selected.value,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        kind,
      },
    })
    toast.success(kind === 'in' ? 'Checked in.' : 'Checked out.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Check-in failed.'
    toast.error(msg)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto" data-testid="field-check-in">
    <h1 class="text-display">Check in</h1>
    <p class="text-body text-text-secondary mt-1">
      Pick a property and record your visit.
    </p>

    <ul class="mt-4 flex flex-col gap-2" data-testid="field-check-in-properties">
      <li v-for="p in properties ?? []" :key="p.id">
        <label
          :class="[
            'flex items-center gap-3 p-3 rounded-card border min-h-tap',
            selected === p.id ? 'border-primary bg-primary/5' : 'border-border bg-surface',
          ]"
        >
          <input
            v-model="selected"
            type="radio"
            :value="p.id"
            class="sr-only"
            :data-testid="`field-check-in-property-${p.id}`"
          >
          <div class="flex-1 min-w-0">
            <p class="text-small font-semibold truncate">{{ p.addressLine1 }}</p>
            <p class="text-tiny text-text-secondary truncate">
              {{ p.city }}, {{ p.state }}
            </p>
          </div>
        </label>
      </li>
    </ul>

    <section class="mt-6 grid grid-cols-2 gap-3">
      <button
        type="button"
        class="min-h-tap rounded-card bg-primary text-white font-semibold disabled:opacity-50"
        data-testid="field-check-in-in"
        :disabled="!selected || busy"
        @click="() => check('in')"
      >
        {{ t('field.check-in', 'in', 'Check in') }}
      </button>
      <button
        type="button"
        class="min-h-tap rounded-card bg-surface border border-border font-semibold disabled:opacity-50"
        data-testid="field-check-in-out"
        :disabled="!selected || busy"
        @click="() => check('out')"
      >
        {{ t('field.check-in', 'out', 'Check out') }}
      </button>
    </section>
  </div>
</template>
