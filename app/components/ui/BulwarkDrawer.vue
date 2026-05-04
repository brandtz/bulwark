<!--
  BulwarkDrawer.vue — slide-in panel from right or bottom.

  Why this component exists
  -------------------------
  Right-drawer for property quick-view, work-order detail-as-overlay,
  filters panel. Bottom-drawer for mobile "actions" sheet. Same a11y
  story as BulwarkModal.

  Decisions
  ---------
  - **Two sides only (right + bottom)**: top/left would clash with
    AppSidebar / AppTopBar physically. We can add later if a real use
    case appears.
-->
<script setup lang="ts">
interface Props {
  modelValue: boolean
  side: 'right' | 'bottom'
  title?: string
  dismissible?: boolean
  /** Tailwind width (right) or height (bottom). */
  sizeClass?: string
}
const props = withDefaults(defineProps<Props>(), {
  title: '',
  dismissible: true,
  sizeClass: '',
})

const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

function close() {
  if (!props.dismissible) return
  emit('update:modelValue', false)
}

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

const panelClass = computed(() => {
  if (props.side === 'right') {
    return `top-0 right-0 h-full ${props.sizeClass || 'w-full sm:w-[28rem]'}`
  }
  return `bottom-0 inset-x-0 ${props.sizeClass || 'max-h-[85vh]'} rounded-t-card`
})

const enterFrom = computed(() => props.side === 'right' ? 'translate-x-full' : 'translate-y-full')
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100" leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 bg-black/40"
        @click.self="close"
      >
        <Transition
          appear
          :enter-active-class="`transition-transform duration-200`"
          :enter-from-class="enterFrom"
          enter-to-class="translate-x-0 translate-y-0"
        >
          <aside
            class="fixed bg-surface shadow-xl flex flex-col"
            :class="panelClass"
            role="dialog"
            aria-modal="true"
          >
            <header
              v-if="title || dismissible"
              class="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0"
            >
              <h2 v-if="title" class="text-h2 text-text-primary">{{ title }}</h2>
              <span v-else />
              <button
                v-if="dismissible"
                type="button"
                class="h-8 w-8 rounded-input text-text-secondary hover:bg-surface-muted"
                aria-label="Close"
                @click="close"
              >×</button>
            </header>
            <div class="flex-1 overflow-y-auto px-5 py-4">
              <slot />
            </div>
            <footer
              v-if="$slots.footer"
              class="px-5 py-3 border-t border-border shrink-0"
            >
              <slot name="footer" />
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
