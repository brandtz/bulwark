/**
 * app/plugins/pwa.client.ts — register the field PWA service worker
 * (W3-3 / EH-M / ADR-0029).
 *
 * # Behaviour
 *   - Client-only (`.client.ts`) so SSR never tries to touch the SW
 *     registry.
 *   - Feature-detects `'serviceWorker' in navigator` so the field
 *     shell still works in browsers without SW support.
 *   - Registers `/sw.js` with `scope: '/'` so the cache covers both
 *     the field surface (`/field/*`) and the assets it pulls (`/_nuxt/*`).
 *
 * # Decisions (ADR-0008)
 *   - Defer registration to `window.load`: the browser is allowed to
 *     prioritize first paint, and registering during initial JS
 *     evaluation can starve the main render.
 *   - Swallow registration failures silently after a single console
 *     warn — a missing SW shouldn't block the rest of the app.
 *
 * # Decision cast down
 *   - Rejected: registering inside `app.vue`. A plugin runs once per
 *     client boot and survives navigations; mounting the registration
 *     inside the root component would risk double-registration on
 *     accidental re-mounts.
 */
export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err: unknown) => {
         
        console.warn('[bulwark] service worker registration failed', err)
      })
  })
})
