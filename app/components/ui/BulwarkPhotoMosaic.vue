<!--
  BulwarkPhotoMosaic.vue — compact photo preview (WP-A3; the property hub's
  photo card, AD-12). Up to `max` thumbnails in a grid; the last tile shows
  "+N" when there are more. Each tile is a button that opens that photo
  (emits open with its index; the full grid/lightbox is BulwarkPhotoGrid,
  WP-A4). Images carry alt text (caption or a numbered fallback); pending
  scans show a placeholder, never the unscanned file (WP-X3).
-->
<script setup lang="ts">
interface Photo { id: string, url: string | null, alt?: string | null, scanStatus?: string | null }
const props = withDefaults(defineProps<{ photos: Photo[], max?: number }>(), { max: 6 })
const emit = defineEmits<{ open: [index: number] }>()

const shown = computed(() => props.photos.slice(0, props.max))
const extra = computed(() => props.photos.length - shown.value.length)
const usable = (p: Photo) => !!p.url && (!p.scanStatus || p.scanStatus === 'clean' || p.scanStatus === 'skipped')
</script>

<template>
  <ul class="grid grid-cols-3 gap-1.5" aria-label="Photos">
    <li v-for="(p, i) in shown" :key="p.id" class="relative">
      <button
        type="button"
        class="block w-full aspect-square overflow-hidden"
        style="border-radius: var(--radius-sm); background: var(--bg-sunken)"
        :aria-label="i === shown.length - 1 && extra > 0 ? `${p.alt ?? `Photo ${i + 1}`}, and ${extra} more` : (p.alt ?? `Photo ${i + 1}`)"
        @click="emit('open', i)"
      >
        <img v-if="usable(p)" :src="p.url!" :alt="p.alt ?? `Photo ${i + 1}`" class="w-full h-full object-cover" loading="lazy">
        <span v-else class="w-full h-full grid place-items-center bw-help">{{ p.scanStatus === 'pending' ? 'Scanning…' : 'Unavailable' }}</span>
        <span v-if="i === shown.length - 1 && extra > 0" class="absolute inset-0 grid place-items-center text-white font-semibold" style="background: rgba(0,0,0,.65)" aria-hidden="true">+{{ extra }}</span>
      </button>
    </li>
  </ul>
</template>
