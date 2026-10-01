<!--
  BulwarkField.vue — label / helper / error frame for any control
  (Packet A components/SPEC.md, WP-A3).

  For controls that are not a Bulwark input primitive (a custom picker, a
  group of radios). The slot receives the ids to wire: bind `id` on the
  control and `describedby` to its aria-describedby, and set aria-invalid from
  `invalid`. `count` is a right-aligned counter ("120 / 280").
-->
<script setup lang="ts">
interface Props {
  label: string
  helper?: string
  error?: string
  required?: boolean
  count?: string
  id?: string
}
const props = withDefaults(defineProps<Props>(), { helper: '', error: '', required: false, count: '', id: undefined })

const uid = useId()
const controlId = computed(() => props.id ?? `fld-${uid}`)
const describedby = computed(() => (props.error ? `${controlId.value}-err` : props.helper ? `${controlId.value}-hint` : undefined))
</script>

<template>
  <div class="bw-field">
    <div class="flex items-baseline justify-between gap-2">
      <label :for="controlId" class="bw-label">
        {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
      </label>
      <span v-if="count" class="bw-help tnum">{{ count }}</span>
    </div>
    <slot :id="controlId" :describedby="describedby" :invalid="!!error" />
    <p v-if="error" :id="`${controlId}-err`" class="bw-error" role="alert">
      <BulwarkIcon name="alert-circle" size="sm" />{{ error }}
    </p>
    <p v-else-if="helper" :id="`${controlId}-hint`" class="bw-help">{{ helper }}</p>
  </div>
</template>
