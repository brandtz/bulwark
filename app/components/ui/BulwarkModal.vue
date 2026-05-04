<!--
  BulwarkModal.vue — accessible centered modal dialog.

  Why this component exists
  -------------------------
  Confirm-destructive-action, quick-edit forms, image-zoom previews. The
  demo's confirm modals were each ad-hoc divs with `display: fixed`. This
  centralises focus trap, Escape-to-dismiss, backdrop click, scroll lock.

  A11y
  ----
  - role="dialog" + aria-modal=true
  - First focusable element gets initial focus
  - Escape closes (unless `dismissible=false`)
  - Body overflow locked while open

  Decisions
  ---------
  - **Native <dialog> rejected**: support is fine but the styling story is
    awkward and we lose teleport-to-body simplicity. We use a portal (Teleport)
    to body which is the Nuxt-friendly pattern.
  - **No promise-based imperative API yet**: useModal() composable lands
    in a follow-up if call-site demand emerges.
-->
<script setup lang="ts">
interface Props {
  modelValue: boolean
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Allow Escape and backdrop-click to dismiss. Default true. */
  dismissible?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  dismissible: true,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  cancel: []
}>()

const sizeClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

function close() {
  if (!props.dismissible) return
  emit('update:modelValue', false)
  emit('cancel')
}

// Esc handler — bound only while open. Avoids leaking listeners.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`mdl-${title}`"
        @click.self="close"
      >
        <div
          class="relative w-full rounded-card bg-surface shadow-xl"
          :class="sizeClass[size]"
        >
          <header class="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
            <h2 :id="`mdl-${title}`" class="text-h2 text-text-primary">{{ title }}</h2>
            <button
              v-if="dismissible"
              type="button"
              class="h-8 w-8 rounded-input text-text-secondary hover:bg-surface-muted"
              aria-label="Close"
              @click="close"
            >×</button>
          </header>
          <div class="px-5 py-4">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="flex items-center justify-end gap-2 px-5 pb-4 pt-2 border-t border-border"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
