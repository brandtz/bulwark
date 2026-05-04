<!--
  pages/admin/properties.vue — placeholder for E3.

  The real Properties pipeline (kanban + list) ships in Epic E3. Until then
  this page exists so the persistent-shell Playwright spec can verify nav
  preservation across two real routes, and so the sidebar's "Properties"
  link doesn't 404 in dev.
-->
<script setup lang="ts">
useHead({ title: 'Properties' })
</script>

<template>
  <div class="p-4 md:p-6">
    <h1 class="text-display">Properties</h1>
    <p class="text-body text-text-secondary mt-1">
      Pipeline kanban + list views land in Epic E3.
    </p>
  </div>
</template>
