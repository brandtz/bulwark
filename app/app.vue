<!--
  app.vue — Bulwark root component

  Owns the <NuxtLayout> + <NuxtPage> wrapper. Authenticated and public shells
  live in app/layouts/ and are selected by route metadata or shell middleware.

  Decisions NOT taken:
    - We do NOT add a global error boundary here. Nuxt's built-in
      error.vue file (added in E2-S6) handles the 404/500 surfaces.
-->
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
