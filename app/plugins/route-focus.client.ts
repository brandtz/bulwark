/**
 * app/plugins/route-focus.client.ts — move focus to the new page on client-side
 * navigation (WP-L08 / epic L09-S3).
 *
 * A full page load starts focus at the top of the document; an SPA navigation
 * does not, so keyboard and screen-reader users were left on the link they
 * activated, with no announcement that the page changed. After each route
 * change we focus the page's first `h1` inside the main landmark (falling back
 * to `main` itself), which screen readers announce.
 *
 * - Skipped on the initial load and when only the query/hash changed (filters,
 *   tabs synced to the URL) so in-page interactions keep their focus.
 * - Skipped if something already took focus deliberately (an autofocused
 *   field, an open dialog).
 * - `preventScroll` so focusing never fights the router's scroll behaviour.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  let pending = false

  router.afterEach((to, from, failure) => {
    if (failure || !from.matched.length) return // initial load / aborted
    if (to.path === from.path) return // query/hash-only change
    pending = true
  })

  nuxtApp.hook('page:finish', () => {
    if (!pending) return
    pending = false
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && active.closest('main, [role="dialog"]') && !active.closest('nav')) return
      const main = document.querySelector<HTMLElement>('main')
      if (!main) return
      const target = main.querySelector<HTMLElement>('h1') ?? main
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    })
  })
})
