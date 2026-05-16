<!--
  app/components/field/FieldInstallBanner.vue — install-app prompt for
  the field PWA (W3-3 / EH-M / ADR-0029).

  # What this is
    Listens for `beforeinstallprompt`, stashes the event, and exposes
    an "Install" pill in the field header that fires the prompt on
    tap. iOS Safari does NOT emit this event — Apple's install flow
    is manual (Share → Add to Home Screen), so on iOS we hide the
    pill entirely.

  # Decisions (ADR-0008)
    - **Only visible inside the field layout** (deliverable E.5). The
      banner is rendered from `layouts/field.vue` — admin pages never
      mount it.
    - **One-shot dismiss**, persisted in localStorage. Re-installing
      after dismiss requires the user to hit "Install app" from the
      browser menu. That's the standard PWA UX.
-->
<script setup lang="ts">
import { useLabel } from '~/composables/useLabel'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const { t } = useLabel()
const deferred = ref<BeforeInstallPromptEvent | null>(null)
const dismissed = ref(false)

const DISMISS_KEY = 'bulwark.field.install-dismissed'

onMounted(() => {
  if (typeof window === 'undefined') return
  try {
    dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    dismissed.value = false
  }
  window.addEventListener('beforeinstallprompt', (evt: Event) => {
    evt.preventDefault()
    deferred.value = evt as BeforeInstallPromptEvent
  })
})

const visible = computed(() => deferred.value !== null && !dismissed.value)

async function install(): Promise<void> {
  if (!deferred.value) return
  try {
    await deferred.value.prompt()
    await deferred.value.userChoice
  } finally {
    deferred.value = null
  }
}

function dismiss(): void {
  dismissed.value = true
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // ignore
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="flex items-center gap-1"
    data-testid="field-install-banner"
  >
    <button
      type="button"
      class="min-h-tap px-3 rounded-input bg-primary/10 text-primary text-tiny font-semibold"
      data-testid="field-install-cta"
      @click="install"
    >
      {{ t('field.install', 'cta', 'Install') }}
    </button>
    <button
      type="button"
      class="min-h-tap min-w-tap inline-flex items-center justify-center text-text-secondary"
      :aria-label="'Dismiss install prompt'"
      data-testid="field-install-dismiss"
      @click="dismiss"
    >
      ×
    </button>
  </div>
</template>
