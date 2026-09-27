/**
 * app/plugins/00.csrf.client.ts — attach the CSRF header to every unsafe
 * same-origin $fetch (WP-L07 S1). Runs first so plugins that capture $fetch
 * (the RPC proxy) get the wrapped instance.
 */
export default defineNuxtPlugin(() => {
  globalThis.$fetch = $fetch.create({
    onRequest({ request, options }) {
      if (!isUnsafeMethod(options.method)) return
      const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
      if (/^https?:\/\//u.test(url) && !url.startsWith(window.location.origin)) return
      const token = readCsrfCookie()
      if (!token) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (!headers.has('x-csrf-token')) headers.set('x-csrf-token', token)
      options.headers = headers
    },
  }) as typeof globalThis.$fetch
})
