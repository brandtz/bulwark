<!--
  app/pages/profile/notifications.vue — per-user notification preferences
  (W2-4 / EH-H Part B / ADR-0021).

  # Decisions
    - Signed-in only (no admin gate). Every user manages their own
      preferences across (eventType × {inApp, email, sms}).
    - Matrix view: rows = KNOWN_EVENT_TYPES, columns = three channels.
    - "Reset to defaults" wipes overrides and re-seeds defaults.
-->
<script setup lang="ts">
import {
  KNOWN_EVENT_TYPES,
  NOTIFICATION_DEFAULTS,
  defaultChannelsFor,
  type NotificationChannels,
  type NotificationSubscription,
} from '~~/shared/contracts/notification-subscription'

definePageMeta({})
useHead({ title: 'Notification preferences' })

const { session, ensureLoaded } = useSession()
await ensureLoaded()

const notifService = useService('notificationSubscription')
const { success: toastSuccess, error: toastError } = useToast()

const orgId = computed(() => session.value?.activeOrganizationId ?? '')
const userId = computed(() => session.value?.userId ?? '')

const subscriptions = ref<NotificationSubscription[]>([])

async function load() {
  if (!orgId.value || !userId.value) return
  const r = await notifService.listForUser(orgId.value, userId.value)
  subscriptions.value = r.rows
}
await load()

function channelsFor(eventType: string): NotificationChannels {
  const sub = subscriptions.value.find((s) => s.eventType === eventType)
  return sub?.channels ?? defaultChannelsFor(eventType)
}

const saving = ref<string | null>(null)
async function toggle(eventType: string, channel: keyof NotificationChannels) {
  saving.value = eventType + ':' + channel
  const current = channelsFor(eventType)
  const next = { ...current, [channel]: !current[channel] }
  try {
    await notifService.upsert({
      organizationId: orgId.value,
      userId: userId.value,
      eventType,
      channels: next,
    })
    await load()
  } catch (err) {
    toastError('Could not save', (err as Error).message)
  } finally {
    saving.value = null
  }
}

const resetting = ref(false)
async function onReset() {
  if (!confirm('Reset all notification preferences to defaults?')) return
  resetting.value = true
  try {
    await notifService.resetToDefaults(orgId.value, userId.value)
    toastSuccess('Reset', 'Preferences restored to defaults.')
    await load()
  } finally {
    resetting.value = false
  }
}

void NOTIFICATION_DEFAULTS
</script>

<template>
  <div class="p-4 md:p-6 max-w-4xl mx-auto" data-testid="profile-notifications">
    <BulwarkBreadcrumbs :items="[{ label: 'Profile' }, { label: 'Notifications' }]" />
    <header class="mt-2 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-display">Notification preferences</h1>
        <p class="text-body text-text-secondary mt-1">
          Choose how Bulwark contacts you for each event.
        </p>
      </div>
      <BulwarkButton
        variant="secondary"
        :disabled="resetting"
        data-testid="notifications-reset-button"
        @click="onReset"
      >{{ resetting ? 'Resetting…' : 'Reset to defaults' }}</BulwarkButton>
    </header>

    <BulwarkCard padding="none" class="mt-6">
      <table class="w-full text-small">
        <thead class="bg-surface-muted text-text-secondary text-tiny uppercase tracking-wide">
          <tr>
            <th class="p-3 text-left">Event</th>
            <th class="p-3 text-center">In-app</th>
            <th class="p-3 text-center">Email</th>
            <th class="p-3 text-center">SMS</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-default">
          <tr
            v-for="evt in KNOWN_EVENT_TYPES"
            :key="evt.eventType"
            data-testid="notification-row"
            :data-event="evt.eventType"
          >
            <td class="p-3">
              <p class="font-medium">{{ evt.label }}</p>
              <p class="text-tiny text-text-secondary">{{ evt.description }}</p>
            </td>
            <td class="p-3 text-center">
              <input
                type="checkbox"
                :checked="channelsFor(evt.eventType).inApp"
                :disabled="saving === evt.eventType + ':inApp'"
                data-testid="channel-inApp"
                @change="toggle(evt.eventType, 'inApp')"
              />
            </td>
            <td class="p-3 text-center">
              <input
                type="checkbox"
                :checked="channelsFor(evt.eventType).email"
                :disabled="saving === evt.eventType + ':email'"
                data-testid="channel-email"
                @change="toggle(evt.eventType, 'email')"
              />
            </td>
            <td class="p-3 text-center">
              <input
                type="checkbox"
                :checked="channelsFor(evt.eventType).sms"
                :disabled="saving === evt.eventType + ':sms'"
                data-testid="channel-sms"
                @change="toggle(evt.eventType, 'sms')"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </BulwarkCard>
  </div>
</template>
