<!--
  DevThemePair.vue — renders its slot twice, light and dark side by side
  (WP-A2 /dev/ui specimen layout, after components/*.html in the design).
  Tokens are scoped by [data-theme] on any element, so each panel is a full
  theme at comfortable density (specimens and visual parity must not follow
  the viewer's saved density). Content is duplicated: scope test locators to a panel
  ([data-panel="light"] / [data-panel="dark"]).
-->
<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <div
      v-for="theme in ['light', 'dark']"
      :key="theme"
      :data-theme="theme"
      :data-panel="theme"
      data-density="comfortable"
      class="p-5 flex flex-col gap-4"
      style="background: var(--bg-page); color: var(--text-primary); border-radius: var(--radius-lg); border: 1px solid var(--border)"
    >
      <slot :theme="theme" />
    </div>
  </div>
</template>

<style>
/* tokens.css (design-synced) defines comfortable density only on :root, so a
   panel cannot opt back into it under html[data-density="touch"]; restate it. */
[data-panel][data-density="comfortable"] {
  --control-h: 40px; --control-h-sm: 32px; --control-h-lg: 48px; --toggle-h: 24px;
  --row-py: 12px; --row-px: 16px; --cell-text: var(--text-sm);
  --card-p: 24px; --gap: 16px; --field-gap: 16px; --touch-min: 40px;
}
</style>
