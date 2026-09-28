/**
 * app/composables/usePushNotifications.ts — this device's Web Push
 * subscription (WP-X3, ED-016).
 *
 * `state`: `unsupported` (no service worker / PushManager), `unavailable`
 * (server has no VAPID keys — keep the channel hidden), `denied` (browser
 * permission blocked), `off`, or `on`.
 */
import type { PushConfig } from '~~/shared/contracts/push'

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on'

function keyToBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/gu, '+').replace(/_/gu, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function usePushNotifications(organizationId: MaybeRefOrGetter<string>) {
  const push = useService('push')
  const state = ref<PushState>('unsupported')
  const busy = ref(false)
  const error = ref('')
  let config: PushConfig | null = null

  const supported = () => import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  async function refresh(): Promise<void> {
    if (!supported()) { state.value = 'unsupported'; return }
    config = await push.config(toValue(organizationId))
    if (!config.enabled || !config.vapidPublicKey) { state.value = 'unavailable'; return }
    if (Notification.permission === 'denied') { state.value = 'denied'; return }
    const reg = await navigator.serviceWorker.ready
    state.value = (await reg.pushManager.getSubscription()) ? 'on' : 'off'
  }

  async function enable(): Promise<void> {
    if (!config?.vapidPublicKey) return
    busy.value = true
    error.value = ''
    try {
      if ((await Notification.requestPermission()) !== 'granted') { state.value = 'denied'; return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(config.vapidPublicKey).buffer as ArrayBuffer })
      const json = sub.toJSON() as { endpoint: string, keys: { p256dh: string, auth: string } }
      await push.subscribe({ organizationId: toValue(organizationId), endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) })
      state.value = 'on'
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not turn on push notifications'
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await push.unsubscribe({ organizationId: toValue(organizationId), endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      state.value = 'off'
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not turn off push notifications'
    } finally {
      busy.value = false
    }
  }

  async function sendTest(): Promise<number> {
    return (await push.sendTest(toValue(organizationId))).sent
  }

  return { state, busy, error, refresh, enable, disable, sendTest }
}
