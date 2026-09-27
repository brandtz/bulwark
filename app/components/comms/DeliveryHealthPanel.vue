<!--
  app/components/comms/DeliveryHealthPanel.vue — email/SMS delivery health
  (WP-L03, gap register 3.2.3).

  # Decisions
    - Operator signal only: last-24h sent/not-sent/failed counts per channel
      plus the most recent failures from the message_deliveries ledger. The
      ledger stores no recipient data, so none is shown.
    - The host page knows which providers are configured and passes the
      missing channels in; each gets a warning banner.
    - Load failures render inline instead of breaking the providers page.
-->
<script setup lang="ts">
import type { DeliveryChannel, DeliveryHealthOutput } from '~~/shared/contracts/delivery'

const props = defineProps<{
  organizationId: string
  unconfiguredChannels: DeliveryChannel[]
}>()

const CHANNELS: Array<{ id: DeliveryChannel, label: string }> = [
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
]

const comms = useService('comms')
const health = ref<DeliveryHealthOutput | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    health.value = await comms.deliveryHealth({ organizationId: props.organizationId, since })
  } catch (err) {
    loadError.value = (err as Error).message
  }
}
await load()

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <BulwarkCard padding="md" data-testid="delivery-health">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-body font-medium">Delivery health</h2>
        <p class="text-small text-text-secondary mt-1">Email and SMS attempts in the last 24 hours.</p>
      </div>
      <BulwarkButton variant="secondary" size="sm" data-testid="delivery-health-refresh" @click="load">
        Refresh
      </BulwarkButton>
    </div>

    <p
      v-for="channel in CHANNELS.filter((c) => unconfiguredChannels.includes(c.id))"
      :key="channel.id"
      class="mt-3 rounded-input border border-status-error px-3 py-2 text-small"
      role="status"
      data-testid="delivery-health-unconfigured"
      :data-channel="channel.id"
    >
      No {{ channel.label }} provider is configured. {{ channel.label }} messages are not being delivered.
    </p>

    <p v-if="loadError" class="text-small text-status-error mt-3" role="alert" data-testid="delivery-health-error">
      Could not load delivery health: {{ loadError }}
    </p>

    <template v-else-if="health">
      <table class="mt-4 w-full text-small">
        <thead>
          <tr class="text-text-secondary text-left">
            <th scope="col" class="py-1 font-medium">Channel</th>
            <th scope="col" class="py-1 font-medium text-right">Sent</th>
            <th scope="col" class="py-1 font-medium text-right">Not sent</th>
            <th scope="col" class="py-1 font-medium text-right">Failed</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="channel in CHANNELS"
            :key="channel.id"
            data-testid="delivery-health-channel"
            :data-channel="channel.id"
          >
            <th scope="row" class="py-1 text-left font-normal">{{ channel.label }}</th>
            <td class="py-1 text-right" data-testid="delivery-health-sent">{{ health.byChannel[channel.id]?.sent ?? 0 }}</td>
            <td class="py-1 text-right" data-testid="delivery-health-stubbed">{{ health.byChannel[channel.id]?.stubbed ?? 0 }}</td>
            <td class="py-1 text-right" data-testid="delivery-health-failed">{{ health.byChannel[channel.id]?.failed ?? 0 }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="health.recentFailures.length" class="mt-4">
        <h3 class="text-small font-medium">Recent failures</h3>
        <ul class="mt-2 divide-y divide-border-default" data-testid="delivery-health-failures">
          <li v-for="f in health.recentFailures" :key="f.id" class="py-2 text-small">
            <span class="font-medium uppercase">{{ f.channel }}</span>
            · {{ f.provider }}
            <span v-if="f.eventType"> · {{ f.eventType }}</span>
            · {{ formatTime(f.createdAt) }}
            <span v-if="f.attempt > 1"> · {{ f.attempt }} attempts</span>
            <p class="text-text-secondary">{{ f.error ?? 'Unknown error' }}</p>
          </li>
        </ul>
      </div>
      <p v-else class="text-small text-text-secondary mt-4" data-testid="delivery-health-no-failures">
        No failed deliveries in the last 24 hours.
      </p>
    </template>
  </BulwarkCard>
</template>
