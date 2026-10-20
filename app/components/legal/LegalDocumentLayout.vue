<!--
  app/components/legal/LegalDocumentLayout.vue — shared reading template for
  Privacy Policy (SH-11), Terms of Service (SH-12), and Data Processing Addendum (SH-13)
  (WP-S2 / ED-00G).

  Features:
    - Table of contents (`data-testid="legal-toc"`) hidden in print media (`no-print`)
      so print stylesheets render TOC-less per WP-S2 acceptance.
    - Effective date, owner badge (`platform` vs `tenant` per ED-00G), and
      optional changelog strip.
-->
<script setup lang="ts">
export interface LegalTocItem {
  id: string
  label: string
}

interface Props {
  title: string
  effectiveDate: string
  owner?: 'platform' | 'tenant'
  toc?: LegalTocItem[]
  changelog?: Array<{ date: string; summary: string }>
}

withDefaults(defineProps<Props>(), {
  owner: 'platform',
  toc: () => [],
  changelog: () => [],
})
</script>

<template>
  <div class="min-h-screen bg-background text-text-primary flex flex-col" data-testid="legal-document" :data-legal-owner="owner">
    <header class="no-print border-b border-border bg-surface">
      <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="font-semibold text-large">Bulwark</NuxtLink>
        <nav class="text-small flex gap-4" aria-label="Legal documents">
          <NuxtLink to="/privacy" class="hover:underline">Privacy</NuxtLink>
          <NuxtLink to="/terms" class="hover:underline">Terms</NuxtLink>
          <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
        </nav>
      </div>
    </header>

    <div class="max-w-5xl mx-auto w-full px-6 py-10 flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-start">
      <aside
        v-if="toc.length"
        class="no-print md:sticky md:top-6 rounded-card border border-border bg-surface p-4"
        aria-label="Table of contents"
        data-testid="legal-toc"
      >
        <div class="text-tiny uppercase tracking-wider text-text-secondary font-semibold mb-2">Contents</div>
        <ol class="flex flex-col gap-1.5 text-small">
          <li v-for="item in toc" :key="item.id">
            <a :href="`#${item.id}`" class="text-text-secondary hover:text-primary hover:underline">{{ item.label }}</a>
          </li>
        </ol>
      </aside>

      <main id="main-content" tabindex="-1" class="prose prose-sm max-w-3xl min-w-0">
        <div class="flex items-center gap-2 flex-wrap mb-2">
          <span class="bw-chip" data-testid="legal-owner-badge">
            {{ owner === 'platform' ? 'Platform policy' : 'Organization terms' }}
          </span>
          <span class="text-text-secondary text-small" data-testid="legal-effective-date">
            Effective {{ effectiveDate }}
          </span>
        </div>
        <h1 class="text-h1 font-semibold mb-4">{{ title }}</h1>

        <slot />

        <section v-if="changelog.length" class="mt-10 pt-6 border-t border-border" data-testid="legal-changelog">
          <h2 class="text-h2 font-semibold mb-2">Changelog</h2>
          <ul class="list-disc pl-5 text-small text-text-secondary">
            <li v-for="entry in changelog" :key="entry.date">
              <strong>{{ entry.date }}:</strong> {{ entry.summary }}
            </li>
          </ul>
        </section>
      </main>
    </div>

    <footer class="no-print border-t border-border bg-surface mt-10">
      <div class="max-w-5xl mx-auto px-6 py-4 text-small text-text-secondary flex flex-wrap justify-between gap-2">
        <span>© 2026 Bulwark.</span>
        <div class="flex gap-3">
          <NuxtLink to="/privacy" class="hover:underline">Privacy</NuxtLink>
          <span>·</span>
          <NuxtLink to="/terms" class="hover:underline">Terms</NuxtLink>
          <span>·</span>
          <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
