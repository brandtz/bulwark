<!--
  BulwarkModal.vue — dialog (Packet A components/SPEC.md, WP-A2).

  role=dialog, aria-modal, labelled by its title; focus trapped with initial
  focus and restore (useFocusTrap, WP-L08). Below 768px it renders as a bottom
  sheet (CSS only, so SSR and hydration agree).

  API: SPEC names `open` / `close` / `confirm` / `closeOnOverlay` /
  `destructive`. Existing callers keep `v-model` (modelValue), `dismissible`
  and `cancel`; both work. `destructive` turns overlay-click dismissal off
  (SPEC: false for destructive) — Esc still cancels unless `dismissible` is
  false. Keep it to six fields or fewer; more belongs in BulwarkDrawer.
  Slots: default, footer.
-->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })

interface Props {
  /** SPEC name. */
  open?: boolean
  /** v-model (existing callers). */
  modelValue?: boolean
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Clicking the overlay closes (SPEC default true; false when destructive). */
  closeOnOverlay?: boolean
  destructive?: boolean
  /** Escape, overlay and the close button can dismiss. Default true. */
  dismissible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: undefined,
  modelValue: undefined,
  size: 'md',
  closeOnOverlay: undefined,
  destructive: false,
  dismissible: true,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  close: []
  cancel: []
  confirm: []
}>()

const isOpen = computed(() => Boolean(props.open ?? props.modelValue))
const overlayCloses = computed(() => props.dismissible && (props.closeOnOverlay ?? !props.destructive))
const width: Record<NonNullable<Props['size']>, string> = { sm: '400px', md: '520px', lg: '720px', xl: '960px' }

const titleId = useId()
const panel = ref<HTMLElement | null>(null)
useFocusTrap(() => isOpen.value, panel)

function close() {
  if (!props.dismissible) return
  emit('update:modelValue', false)
  emit('close')
  emit('cancel')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  isOpen,
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
        v-if="isOpen"
        class="bw-modal-overlay"
        v-bind="$attrs"
        :role="destructive ? 'alertdialog' : 'dialog'"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="overlayCloses && close()"
      >
        <div
          ref="panel"
          class="bw-modal bw-modal-panel focus:outline-none"
          :style="{ '--w': width[size] }"
        >
          <header class="bw-modal__hd">
            <h3 :id="titleId">{{ title }}</h3>
            <button
              v-if="dismissible"
              type="button"
              class="bw-btn bw-btn--ghost bw-btn--icon bw-btn--sm"
              aria-label="Close"
              @click="close"
            >
              <BulwarkIcon name="x" size="sm" />
            </button>
          </header>
          <div class="bw-modal__bd" data-dialog-body>
            <slot />
          </div>
          <footer v-if="$slots.footer" class="bw-modal__ft">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.bw-modal-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: var(--overlay);
}
/* SPEC: below 768px the modal is a bottom sheet. */
@media (max-width: 767px) {
  .bw-modal-overlay { align-items: flex-end; padding: 0; }
  .bw-modal-panel {
    width: 100%; max-height: 92vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .bw-modal-panel::before {
    content: ""; display: block; width: 40px; height: 4px; border-radius: 2px;
    background: var(--neutral-300); margin: 8px auto 0;
  }
}
</style>
