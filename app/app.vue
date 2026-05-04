<!--
  app.vue — Bulwark root component

  Owns the <NuxtLayout> + <NuxtPage> wrapper. Layouts (default, auth, public)
  live in app/layouts/. The persistent navigation lives inside layouts/default.vue
  per ADR-0005.

  Decisions NOT taken:
    - We do NOT add a global error boundary here. Nuxt's built-in
      error.vue file (added in E2-S6) handles the 404/500 surfaces.
-->
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
