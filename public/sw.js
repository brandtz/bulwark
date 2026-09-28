/*
 * public/sw.js — Bulwark PWA service worker (W3-3 / EH-M / ADR-0029).
 *
 * Strategy:
 *   - Cache-first for same-origin static assets (Nuxt build output,
 *     icons, fonts) — keeps the field shell instant on a flaky link.
 *   - Network-first for `/api/*` — never serve stale tenant data.
 *   - Pass-through for everything else.
 *
 * Background sync for queued writes is left as a Phase 2 stub (see
 * ADR-0029). The current offline queue runs in the page context and
 * drains on the `online` event, which is sufficient for Phase 1.
 *
 * Hand-rolled (no @vite-pwa/nuxt dependency): the @vite-pwa/nuxt
 * module is not in package.json and adding it mid-stream introduces
 * tooling risk (Workbox version pinning, Nuxt module ordering) that
 * we don't yet need. Decision documented in ADR-0029.
 */
'use strict'

const VERSION = 'bulwark-field-v1'
const STATIC_CACHE = `${VERSION}-static`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        '/manifest.webmanifest',
        '/icons/sprite.svg',
      ]),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

function isApi(url) {
  return url.pathname.startsWith('/api/')
}

function isCacheableStatic(url) {
  if (url.origin !== self.location.origin) return false
  if (isApi(url)) return false
  return /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (isApi(url)) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    return
  }

  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
      }),
    )
  }
})

// Phase 2 stub — accept `sync` events but no-op for now. The page-side
// useOfflineQueue handles drain in Phase 1.
self.addEventListener('sync', (_event) => {
  // intentionally empty
})

// WP-X3 / ED-016: Web Push. Pushes are payload-less by design (nothing
// sensitive transits the push service), so show a generic prompt and open the
// signed-in notifications page, which reads the real content.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Bulwark', {
      body: 'You have a new notification.',
      icon: '/icons/sprite.svg',
      tag: 'bulwark-notification',
      renotify: true,
      data: { url: '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
