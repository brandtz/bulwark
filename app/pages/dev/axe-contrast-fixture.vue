<script setup lang="ts">
definePageMeta({ layout: false })
</script>

<template>
  <main class="contrast-fixture">
    <p>Known low-contrast fixture text</p>
  </main>
</template>

<style scoped>
.contrast-fixture {
  min-height: 100vh;
  padding: 2rem;
  color: #888;
  background: #fff;
}
</style>