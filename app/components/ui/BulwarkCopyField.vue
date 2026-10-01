<!--
  BulwarkCopyField.vue — read-only value with Copy (Packet A components/SPEC.md, WP-A3).

  The input is readonly and selectable (copy by hand works too). Copy uses the
  clipboard API and announces "Copied" in a live region. `masked` hides the
  value until Show; `oneTime` says it will not be shown again (API keys,
  invite links) and emits `copy` so the caller can record it.
-->
<script setup lang="ts">
interface Props {
  value: string
  label: string
  masked?: boolean
  oneTime?: boolean
}
const props = withDefaults(defineProps<Props>(), { masked: false, oneTime: false })
const emit = defineEmits<{ copy: [] }>()

const uid = useId()
const shown = ref(!props.masked)
const status = ref('')

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    status.value = 'Copied'
  } catch {
    status.value = 'Copy failed — select the text and copy it'
  }
  emit('copy')
  setTimeout(() => { status.value = '' }, 2500)
}
</script>

<template>
  <div class="bw-field">
    <label :for="uid" class="bw-label">{{ label }}</label>
    <div class="flex gap-2">
      <input :id="uid" class="bw-input mono" readonly :type="shown ? 'text' : 'password'" :value="value" @focus="($event.target as HTMLInputElement).select()">
      <BulwarkButton v-if="masked" variant="secondary" @click="shown = !shown">{{ shown ? 'Hide' : 'Show' }}</BulwarkButton>
      <BulwarkButton variant="secondary" :aria-describedby="`${uid}-status`" @click="copy">Copy</BulwarkButton>
    </div>
    <p v-if="oneTime" class="bw-help">Copy it now — it won’t be shown again.</p>
    <p :id="`${uid}-status`" class="bw-help" aria-live="polite">{{ status }}</p>
  </div>
</template>
