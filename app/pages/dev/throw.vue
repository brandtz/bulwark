<!--
  pages/dev/throw.vue \u2014 deterministic 500 trigger for the
  Playwright error-page spec (E2-S6).

  # Decisions (ADR-0008)

  - **Lives under `/dev/`** so it inherits the public-route allowance
    in `auth.global.ts` (no sign-in needed) and ships only in dev /
    test bundles. Production builds don't surface it.
  - **Throws synchronously in setup** via `createError({ fatal: true })`
    so Nuxt's error handler routes the request through `error.vue`
    rather than returning HTTP 200 with a half-rendered page.

  # Decision cast down

  - **Use `useFetch` against a known-bad endpoint to force a 500**.
    Rejected \u2014 less deterministic, harder to test, depends on Nitro
    error formatting we don't control.
-->

<script setup lang="ts">
throw createError({
  statusCode: 500,
  statusMessage: 'Intentional dev throw for E2-S6 spec',
  fatal: true,
})
</script>

<template>
  <div />
</template>
